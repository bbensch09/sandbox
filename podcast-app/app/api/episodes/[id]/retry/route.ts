import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { inngest } from '@/inngest/client';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabase();

  const { data: episode, error } = await supabase
    .from('episodes')
    .select('status, content, character_count')
    .eq('id', id)
    .single();

  if (error || !episode) return NextResponse.json({ error: 'Episode not found' }, { status: 404 });

  // If content was already extracted, skip back to awaiting_confirmation so the
  // user just picks a provider again — no need to re-fetch the article.
  if (episode.content && episode.character_count) {
    await supabase
      .from('episodes')
      .update({
        status: 'awaiting_confirmation',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    return NextResponse.json({ ok: true, status: 'awaiting_confirmation' });
  }

  // No content yet — restart from extraction
  await supabase
    .from('episodes')
    .update({
      status: 'pending',
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  await inngest.send({ name: 'episode/extract', data: { episodeId: id } });
  return NextResponse.json({ ok: true, status: 'pending' });
}
