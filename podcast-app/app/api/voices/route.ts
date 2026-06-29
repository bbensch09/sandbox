import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { fetchVoices } from '@/lib/elevenlabs';

export async function GET() {
  const supabase = createServerSupabase();
  const { data: settings } = await supabase
    .from('settings')
    .select('elevenlabs_api_key')
    .eq('id', 'singleton')
    .single();

  if (!settings?.elevenlabs_api_key) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 400 });
  }

  try {
    const voices = await fetchVoices(settings.elevenlabs_api_key);
    return NextResponse.json(voices);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch voices' },
      { status: 500 },
    );
  }
}
