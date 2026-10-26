import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { requireAllowedUser } from '@/lib/auth';
import { preprocessForTTS } from '@/lib/elevenlabs';
import { parseTranscript } from '@/lib/transcript';

const EDITABLE = new Set(['needs_review', 'awaiting_confirmation']);

/** Save reviewed text; with `approve`, release it to the provider picker. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAllowedUser();
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) return NextResponse.json({ error: 'Text is empty' }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: episode, error } = await supabase
    .from('episodes')
    .select('status, is_interview')
    .eq('id', id)
    .single();
  if (error || !episode) return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
  if (!EDITABLE.has(episode.status)) {
    return NextResponse.json(
      { error: `Episode is ${episode.status}; text can only be edited before audio is generated` },
      { status: 409 },
    );
  }

  const updates: Record<string, unknown> = {
    content,
    character_count: preprocessForTTS(content).length,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim();
  if (episode.is_interview) updates.speaker_count = parseTranscript(content).speakerCount;
  if (body.approve) updates.status = 'awaiting_confirmation';

  const { data, error: saveError } = await supabase
    .from('episodes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
  return NextResponse.json(data);
}
