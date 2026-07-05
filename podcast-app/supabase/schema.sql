-- Run this in your Supabase SQL editor

-- Settings (singleton row for API keys / preferences)
create table if not exists settings (
  id text primary key default 'singleton',
  elevenlabs_api_key text,
  elevenlabs_voice_id text default 'pNInz6obpgDQGcFmaJgB',
  elevenlabs_voice_name text default 'Adam (ElevenLabs built-in)',
  updated_at timestamptz default now()
);

insert into settings (id) values ('singleton') on conflict (id) do nothing;

-- Episodes
create table if not exists episodes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_url text,
  content text,
  audio_path text,
  audio_url text,
  duration_seconds integer,
  word_count integer,
  status text default 'pending',
  error_message text,
  listen_position_seconds float default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Realtime on episodes so the UI gets live status updates
alter publication supabase_realtime add table episodes;

-- Storage bucket for audio files
-- Run this separately in the Supabase dashboard → Storage → New bucket:
--   Name: audio
--   Public: true

-- ── Run the following to add new columns (if upgrading an existing database) ──

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS openai_api_key text,
  ADD COLUMN IF NOT EXISTS openai_voice text DEFAULT 'onyx',
  ADD COLUMN IF NOT EXISTS allowed_emails text[] DEFAULT ARRAY['bbensch@gmail.com'];

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS character_count integer,
  ADD COLUMN IF NOT EXISTS tts_provider text;
