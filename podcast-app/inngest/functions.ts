import { inngest } from './client';
import { createServerSupabase } from '@/lib/supabase-server';
import { extractArticle } from '@/lib/extraction';
import { generateSpeech, chunkText, preprocessForTTS } from '@/lib/elevenlabs';
import { generateSpeechOpenAI } from '@/lib/openai-tts';

type FailureEvent = { data?: { event?: { data?: { episodeId?: string } } } };

async function markFailed(episodeId: string, message: string) {
  const supabase = createServerSupabase();
  await supabase
    .from('episodes')
    .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
    .eq('id', episodeId);
}

// ── Step 1: Extract article content ────────────────────────────────────────
export const extractEpisode = inngest.createFunction(
  {
    id: 'extract-episode',
    name: 'Extract Episode',
    retries: 2,
    triggers: [{ event: 'episode/extract' }],
    onFailure: async ({ error, event }: { error: Error; event: FailureEvent }) => {
      const episodeId = event?.data?.event?.data?.episodeId;
      if (episodeId) await markFailed(episodeId, error.message);
    },
  },
  async ({ event, step }: { event: { data: { episodeId: string } }; step: import('inngest').GetStepTools<typeof inngest> }) => {
    const { episodeId } = event.data;
    const supabase = createServerSupabase();

    // Fetch episode
    const episode = await step.run('fetch-episode', async () => {
      const { data, error } = await supabase
        .from('episodes')
        .select('*')
        .eq('id', episodeId)
        .single();
      if (error) throw new Error(`Episode not found: ${error.message}`);
      return data;
    });

    // Mark as extracting
    await step.run('mark-extracting', async () => {
      await supabase
        .from('episodes')
        .update({ status: 'extracting', updated_at: new Date().toISOString() })
        .eq('id', episodeId);
    });

    // Extract content (or use existing pasted content)
    await step.run('extract-content', async () => {
      let content: string = episode.content as string;
      let title: string = episode.title as string;

      if (!content) {
        if (!episode.source_url) throw new Error('No content or URL to extract from');
        const extracted = await extractArticle(episode.source_url as string);
        content = extracted.content;
        if (title === 'Untitled') title = extracted.title;
      }

      const cleanText = preprocessForTTS(content);
      const characterCount = cleanText.length;

      await supabase
        .from('episodes')
        .update({
          title,
          content,
          character_count: characterCount,
          status: 'awaiting_confirmation',
          updated_at: new Date().toISOString(),
        })
        .eq('id', episodeId);
    });

    return { episodeId, status: 'awaiting_confirmation' };
  },
);

// ── Step 2: Generate audio (triggered by user choosing provider) ────────────
export const generateEpisode = inngest.createFunction(
  {
    id: 'generate-episode',
    name: 'Generate Episode',
    retries: 2,
    triggers: [{ event: 'episode/generate' }],
    onFailure: async ({ error, event }: { error: Error; event: FailureEvent }) => {
      const episodeId = event?.data?.event?.data?.episodeId;
      if (episodeId) await markFailed(episodeId, error.message);
    },
  },
  async ({
    event,
    step,
  }: {
    event: { data: { episodeId: string; provider: 'elevenlabs' | 'openai' } };
    step: import('inngest').GetStepTools<typeof inngest>;
  }) => {
    const { episodeId, provider } = event.data;
    const supabase = createServerSupabase();

    // Fetch episode + settings
    const { episode, settings } = await step.run('fetch-data', async () => {
      const [episodeRes, settingsRes] = await Promise.all([
        supabase.from('episodes').select('*').eq('id', episodeId).single(),
        supabase.from('settings').select('*').eq('id', 'singleton').single(),
      ]);
      if (episodeRes.error) throw new Error(`Episode not found: ${episodeRes.error.message}`);
      if (settingsRes.error) throw new Error(`Settings not found: ${settingsRes.error.message}`);

      if (provider === 'elevenlabs' && !settingsRes.data.elevenlabs_api_key) {
        throw new Error('ElevenLabs API key not configured. Visit /settings to add it.');
      }
      if (provider === 'openai' && !settingsRes.data.openai_api_key) {
        throw new Error('OpenAI API key not configured. Visit /settings to add it.');
      }

      return { episode: episodeRes.data, settings: settingsRes.data };
    });

    // Mark as processing
    await step.run('mark-processing', async () => {
      await supabase
        .from('episodes')
        .update({
          status: 'processing',
          tts_provider: provider,
          updated_at: new Date().toISOString(),
        })
        .eq('id', episodeId);
    });

    // Generate audio + upload (single step — Buffer can't cross step boundaries)
    await step.run('generate-and-upload', async () => {
      const content = episode.content as string;
      const cleanText = preprocessForTTS(content);
      const wordCount = cleanText.split(/\s+/).length;
      // OpenAI TTS max is 4096 chars; ElevenLabs allows 5000
      const chunks = chunkText(cleanText, provider === 'openai' ? 4000 : 4500);

      const buffers: Buffer[] = [];
      for (const chunk of chunks) {
        let buf: Buffer;
        if (provider === 'openai') {
          buf = await generateSpeechOpenAI(
            chunk,
            (settings.openai_voice as string) ?? 'onyx',
            settings.openai_api_key as string,
          );
        } else {
          buf = await generateSpeech(
            chunk,
            settings.elevenlabs_voice_id as string,
            settings.elevenlabs_api_key as string,
          );
        }
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

    return { episodeId, provider, status: 'ready' };
  },
);
