import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { inngest } from '@/inngest/client';

export async function GET() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, sourceUrl, content, isInterview } = body;

  if (!sourceUrl && !content) {
    return NextResponse.json(
      { error: 'Provide either a URL or pasted text content' },
      { status: 400 },
    );
  }

  const supabase = createServerSupabase();

  const { data: episode, error } = await supabase
    .from('episodes')
    .insert({
      title: title || 'Untitled',
      source_url: sourceUrl || null,
      content: content || null,
      status: 'pending',
      is_interview: !!isInterview,
    })
    .select()
    .single();

  if (error) {
    // Report the whole PostgREST error. `message` alone can be empty (and is
    // then dropped by JSON.stringify), which leaves the client with no cause.
    // First line only — PostgREST/undici stuff full stack traces into `details`.
    const firstLine = (s?: string | null) => (s ?? '').split('\n')[0].trim();
    const detail = [firstLine(error.message), firstLine(error.details), firstLine(error.hint)]
      .filter(Boolean)
      .join(' — ')
      .slice(0, 300);
    return NextResponse.json(
      { error: detail || `Database insert failed (code ${error.code ?? 'unknown'})` },
      { status: 500 },
    );
  }

  // The row exists by this point. If the job can't be queued, report that
  // precisely rather than throwing and returning an empty-bodied 500.
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
      { error: `Episode saved, but the extraction job could not be queued: ${message}` },
      { status: 502 },
    );
  }

  return NextResponse.json(episode, { status: 201 });
}
