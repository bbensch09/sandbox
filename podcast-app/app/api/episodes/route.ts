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
  const { title, sourceUrl, content } = body;

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
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire Inngest job
  await inngest.send({
    name: 'episode/process',
    data: { episodeId: episode.id },
  });

  return NextResponse.json(episode, { status: 201 });
}
