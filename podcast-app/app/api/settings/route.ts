import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export async function GET() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('settings')
    .select('elevenlabs_voice_id, elevenlabs_voice_name, updated_at')
    .eq('id', 'singleton')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Check if key exists without exposing it
  const { data: keyCheck } = await supabase
    .from('settings')
    .select('elevenlabs_api_key')
    .eq('id', 'singleton')
    .single();

  return NextResponse.json({
    ...data,
    has_api_key: !!keyCheck?.elevenlabs_api_key,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = createServerSupabase();

  const updates: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };

  if (body.elevenlabs_api_key !== undefined) {
    updates.elevenlabs_api_key = body.elevenlabs_api_key;
  }
  if (body.elevenlabs_voice_id) {
    updates.elevenlabs_voice_id = body.elevenlabs_voice_id;
  }
  if (body.elevenlabs_voice_name) {
    updates.elevenlabs_voice_name = body.elevenlabs_voice_name;
  }

  const { error } = await supabase
    .from('settings')
    .update(updates)
    .eq('id', 'singleton');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
