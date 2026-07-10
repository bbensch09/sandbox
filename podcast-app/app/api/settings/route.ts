import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

export async function GET() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('settings')
    .select('elevenlabs_voice_id, elevenlabs_voice_name, openai_voice, inworld_voice, allowed_emails, updated_at')
    .eq('id', 'singleton')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: keys } = await supabase
    .from('settings')
    .select('elevenlabs_api_key, openai_api_key, inworld_api_key')
    .eq('id', 'singleton')
    .single();

  return NextResponse.json({
    ...data,
    has_elevenlabs_key: !!keys?.elevenlabs_api_key,
    has_openai_key: !!keys?.openai_api_key,
    has_inworld_key: !!keys?.inworld_api_key,
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerSupabase();
  const { data: settingsCheck } = await supabase
    .from('settings')
    .select('allowed_emails')
    .eq('id', 'singleton')
    .single();

  if (!settingsCheck?.allowed_emails?.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.elevenlabs_api_key !== undefined) updates.elevenlabs_api_key = body.elevenlabs_api_key.trim();
  if (body.elevenlabs_voice_id) updates.elevenlabs_voice_id = body.elevenlabs_voice_id;
  if (body.elevenlabs_voice_name) updates.elevenlabs_voice_name = body.elevenlabs_voice_name;
  if (body.openai_api_key !== undefined) updates.openai_api_key = body.openai_api_key.trim();
  if (body.openai_voice) updates.openai_voice = body.openai_voice;
  if (body.inworld_api_key !== undefined) updates.inworld_api_key = body.inworld_api_key.trim();
  if (body.inworld_voice) updates.inworld_voice = body.inworld_voice;
  if (Array.isArray(body.allowed_emails)) updates.allowed_emails = body.allowed_emails;

  const { error } = await supabase
    .from('settings')
    .update(updates)
    .eq('id', 'singleton');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
