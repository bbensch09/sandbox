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

    // Prepare chunks — returns plain strings so they safely cross step boundaries
    const { chunks, wordCount } = await step.run('prepare-chunks', async () => {
      const cleanText = preprocessForTTS(episode.content as string);
      // OpenAI TTS hard max is 4096 chars; ElevenLabs allows 5000
      const chunks = chunkText(cleanText, provider === 'openai' ? 4000 : 4500);
      return { chunks, wordCount: cleanText.split(/\s+/).length };
    });

    // Generate one chunk per step — each call is ~3-5s, well under Vercel's
    // 10s function timeout. Inngest memoizes completed steps on replay so the
    // loop is safe: already-done chunks are skipped on each re-invocation.
    // Buffers can't cross step boundaries (JSON serialization), so each chunk
    // is uploaded to temporary storage and combined in the final step.
    for (let i = 0; i < chunks.length; i++) {
      const idx = i;
      await step.run(`generate-chunk-${idx}`, async () => {
        const buf =
          provider === 'openai'
            ? await generateSpeechOpenAI(
                chunks[idx],
                (settings.openai_voice as string) ?? 'onyx',
                settings.openai_api_key as string,
              )
            : await generateSpeech(
                chunks[idx],
                settings.elevenlabs_voice_id as string,
                settings.elevenlabs_api_key as string,
              );

        const { error } = await supabase.storage
          .from('audio')
          .upload(`${episodeId}-chunk-${idx}.mp3`, buf, {
            contentType: 'audio/mpeg',
            upsert: true,
          });
        if (error) throw new Error(`Chunk ${idx} upload failed: ${error.message}`);
      });
    }

    // Download all chunks in parallel, concatenate, upload final file
    await step.run('combine-and-finalize', async () => {
      const buffers = await Promise.all(
        Array.from({ length: chunks.length }, async (_, i) => {
          const { data, error } = await supabase.storage
            .from('audio')
            .download(`${episodeId}-chunk-${i}.mp3`);
          if (error) throw new Error(`Chunk ${i} download failed: ${error.message}`);
          return Buffer.from(await data.arrayBuffer());
        }),
      );

      const combined = Buffer.concat(buffers);
      const path = `${episodeId}.mp3`;

      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(path, combined, { contentType: 'audio/mpeg', upsert: true });
      if (uploadError) throw new Error(`Final upload failed: ${uploadError.message}`);

      // Clean up temp chunk files (best-effort)
      await supabase.storage
        .from('audio')
        .remove(Array.from({ length: chunks.length }, (_, i) => `${episodeId}-chunk-${i}.mp3`));

      const { data: urlData } = supabase.storage.from('audio').getPublicUrl(path);

      await supabase
        .from('episodes')
        .update({
          audio_path: path,
          audio_url: urlData.publicUrl,
          word_count: wordCount,
          duration_seconds: Math.round((wordCount / 140) * 60),
          status: 'ready',
          updated_at: new Date().toISOString(),
        })
        .eq('id', episodeId);
    });

    return { episodeId, provider, status: 'ready' };
  },
);
