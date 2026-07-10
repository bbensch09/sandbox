import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { inngest } from '@/inngest/client';

async function getAuthedUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(list) { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerSupabase();
  const { data: settings } = await supabase
    .from('settings')
    .select('allowed_emails')
    .eq('id', 'singleton')
    .single();

  if (!settings?.allowed_emails?.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const provider = body.provider as 'elevenlabs' | 'openai' | 'inworld';

  if (provider !== 'elevenlabs' && provider !== 'openai' && provider !== 'inworld') {
    return NextResponse.json({ error: 'provider must be elevenlabs, openai, or inworld' }, { status: 400 });
  }

  const { data: episode, error } = await supabase
    .from('episodes')
    .select('status')
    .eq('id', id)
    .single();

  if (error || !episode) return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
  if (episode.status !== 'awaiting_confirmation') {
    return NextResponse.json(
      { error: `Episode is ${episode.status}, not awaiting confirmation` },
      { status: 409 },
    );
  }

  await inngest.send({ name: 'episode/generate', data: { episodeId: id, provider } });

  return NextResponse.json({ ok: true });
}
