import { inngest } from './client';
import { createServerSupabase } from '@/lib/supabase-server';
import { extractArticle } from '@/lib/extraction';
import { generateSpeech, chunkText, preprocessForTTS } from '@/lib/elevenlabs';

export const processEpisode = inngest.createFunction(
  {
    id: 'process-episode',
    name: 'Process Episode',
    retries: 2,
    triggers: [{ event: 'episode/process' }],
    onFailure: async ({ error, event }: { error: Error; event: { data: { data: { episodeId: string } } } }) => {
      const supabase = createServerSupabase();
      const episodeId = event?.data?.data?.episodeId;
      if (!episodeId) return;
      await supabase
        .from('episodes')
        .update({
          status: 'failed',
          error_message: error.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', episodeId);
    },
  },
  async ({ event, step }: { event: { data: { episodeId: string } }; step: import('inngest').GetStepTools<typeof inngest> }) => {
    const { episodeId } = event.data;
    const supabase = createServerSupabase();

    // ── 1. Fetch episode + settings ──────────────────────────────────────
    const { episode, settings } = await step.run('fetch-data', async () => {
      const [episodeRes, settingsRes] = await Promise.all([
        supabase.from('episodes').select('*').eq('id', episodeId).single(),
        supabase.from('settings').select('*').eq('id', 'singleton').single(),
      ]);

      if (episodeRes.error) throw new Error(`Episode not found: ${episodeRes.error.message}`);
      if (settingsRes.error) throw new Error(`Settings not found: ${settingsRes.error.message}`);
      if (!settingsRes.data.elevenlabs_api_key) {
        throw new Error('ElevenLabs API key not configured. Visit /settings to add it.');
      }

      return { episode: episodeRes.data, settings: settingsRes.data };
    });

    // ── 2. Mark as processing ────────────────────────────────────────────
    await step.run('mark-processing', async () => {
      await supabase
        .from('episodes')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', episodeId);
    });

    // ── 3. Extract content if we only have a URL ─────────────────────────
    const content: string = await step.run('extract-content', async () => {
      if (episode.content) return episode.content as string;
      if (!episode.source_url) throw new Error('No content or URL to extract from');

      const extracted = await extractArticle(episode.source_url as string);

      await supabase
        .from('episodes')
        .update({
          title: episode.title === 'Untitled' ? extracted.title : episode.title,
          content: extracted.content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', episodeId);

      return extracted.content;
    });

    // ── 4. Generate audio + upload (single step — Buffer can't cross step boundary) ──
    await step.run('generate-and-upload', async () => {
      const cleanText = preprocessForTTS(content);
      const wordCount = cleanText.split(/\s+/).length;
      const chunks = chunkText(cleanText);

      const buffers: Buffer[] = [];
      for (const chunk of chunks) {
        const buf = await generateSpeech(
          chunk,
          settings.elevenlabs_voice_id as string,
          settings.elevenlabs_api_key as string,
        );
        buffers.push(buf);
      }

      const combined = Buffer.concat(buffers);
      const durationSeconds = Math.round((wordCount / 140) * 60);
      const path = `${episodeId}.mp3`;

      const { error } = await supabase.storage
        .from('audio')
        .upload(path, combined, { contentType: 'audio/mpeg', upsert: true });

      if (error) throw new Error(`Storage upload failed: ${error.message}`);

      const { data: urlData } = supabase.storage.from('audio').getPublicUrl(path);

      await supabase
        .from('episodes')
        .update({
          audio_path: path,
          audio_url: urlData.publicUrl,
          word_count: wordCount,
          duration_seconds: durationSeconds,
          status: 'ready',
          updated_at: new Date().toISOString(),
        })
        .eq('id', episodeId);
    });

    return { episodeId, status: 'ready' };
  },
);
