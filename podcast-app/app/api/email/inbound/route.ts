import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createServerSupabase } from '@/lib/supabase-server';
import { inngest } from '@/inngest/client';
import { parseForwardedEmail, normalizeAddress } from '@/lib/email-parse';

/** Constant-time compare so the shared secret can't be probed byte by byte. */
function secretMatches(provided: string | null): boolean {
  const expected = process.env.EMAIL_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!process.env.EMAIL_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'EMAIL_WEBHOOK_SECRET is not configured on this deployment' },
      { status: 503 },
    );
  }

  if (!secretMatches(request.headers.get('x-articlecast-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { from?: string; subject?: string; text?: string; html?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  if (!body.from) {
    return NextResponse.json({ error: 'Missing "from"' }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // Second gate: the secret proves the request came from the Worker, this
  // proves a stranger didn't just mail the address.
  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('allowed_emails')
    .eq('id', 'singleton')
    .single();

  // Fail loudly rather than falling through to "sender not allowed". An
  // unreadable settings row would otherwise drop every forwarded email with no
  // bounce and no record.
  if (settingsError) {
    return NextResponse.json(
      { error: `Could not read settings: ${settingsError.message}` },
      { status: 503 },
    );
  }

  const allowed = (settings?.allowed_emails ?? []).map((e: string) =>
    e.trim().toLowerCase(),
  );

  if (allowed.length === 0) {
    return NextResponse.json(
      { error: 'allowed_emails is empty — no sender can be accepted' },
      { status: 503 },
    );
  }

  const sender = normalizeAddress(body.from);

  if (!allowed.includes(sender)) {
    // 202 rather than 403: the mail was delivered and consciously ignored, and
    // a rejection status would make the Worker retry a message we don't want.
    return NextResponse.json(
      { ignored: true, reason: `Sender ${sender} is not in allowed_emails` },
      { status: 202 },
    );
  }

  const parsed = parseForwardedEmail({
    subject: body.subject,
    text: body.text,
    html: body.html,
  });

  if (!parsed.content && !parsed.sourceUrl) {
    return NextResponse.json(
      { error: 'Email contained neither usable text nor a link' },
      { status: 422 },
    );
  }

  const { data: episode, error } = await supabase
    .from('episodes')
    .insert({
      title: parsed.title,
      source_url: parsed.sourceUrl,
      content: parsed.content,
      status: 'pending',
      is_interview: false,
      source_type: 'email',
      auto_convert: true,
    })
    .select()
    .single();

  if (error) {
    const firstLine = (s?: string | null) => (s ?? '').split('\n')[0].trim();
    const detail = [firstLine(error.message), firstLine(error.details)]
      .filter(Boolean)
      .join(' — ')
      .slice(0, 300);
    return NextResponse.json(
      { error: detail || `Insert failed (code ${error.code ?? 'unknown'})` },
      { status: 500 },
    );
  }

  try {
    await inngest.send({
      name: 'episode/extract',
      data: { episodeId: episode.id },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('episodes')
      .update({ status: 'failed', error_message: `Could not queue extraction: ${message}` })
      .eq('id', episode.id);
    return NextResponse.json(
      { error: `Episode saved, but extraction could not be queued: ${message}` },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      episodeId: episode.id,
      title: parsed.title,
      mode: parsed.sourceUrl ? 'link' : 'body',
    },
    { status: 201 },
  );
}
