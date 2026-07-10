import { inngest } from './client';
import { createServerSupabase } from '@/lib/supabase-server';
import { extractArticle } from '@/lib/extraction';
import { generateSpeech, chunkText, preprocessForTTS } from '@/lib/elevenlabs';
import { generateSpeechOpenAI } from '@/lib/openai-tts';
import { generateSpeechInworld } from '@/lib/inworld-tts';
import { parseTranscript, getInterviewVoice } from '@/lib/transcript';

type FailureEvent = { data?: { event?: { data?: { episodeId?: string } } } };

interface ChunkInfo {
  text: string;
  voice?: string; // per-speaker override for interview mode
}

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

    const episode = await step.run('fetch-episode', async () => {
      const { data, error } = await supabase
        .from('episodes')
        .select('*')
        .eq('id', episodeId)
        .single();
      if (error) throw new Error(`Episode not found: ${error.message}`);
      return data;
    });

    await step.run('mark-extracting', async () => {
      await supabase
        .from('episodes')
        .update({ status: 'extracting', updated_at: new Date().toISOString() })
        .eq('id', episodeId);
    });

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

      // For interview transcripts, detect speaker count
      let speakerCount: number | null = null;
      if (episode.is_interview) {
        const transcript = parseTranscript(content);
        speakerCount = transcript.speakerCount;
      }

      await supabase
        .from('episodes')
        .update({
          title,
          content,
          character_count: characterCount,
          ...(speakerCount !== null ? { speaker_count: speakerCount } : {}),
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
    event: { data: { episodeId: string; provider: 'elevenlabs' | 'openai' | 'inworld' } };
    step: import('inngest').GetStepTools<typeof inngest>;
  }) => {
    const { episodeId, provider } = event.data;
    const supabase = createServerSupabase();

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
      if (provider === 'inworld' && !settingsRes.data.inworld_api_key) {
        throw new Error('Inworld API key not configured. Visit /settings to add it.');
      }

      return { episode: episodeRes.data, settings: settingsRes.data };
    });

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

    // Build chunk list — returns plain strings + optional voice overrides
    // so the result safely crosses Inngest step boundaries (no Buffers).
    const { chunks, wordCount } = await step.run('prepare-chunks', async () => {
      const content = episode.content as string;
      const maxChars = provider === 'openai' ? 4000 : provider === 'inworld' ? 1900 : 4500;

      if (episode.is_interview) {
        // Parse speaker turns and assign per-speaker voices
        const transcript = parseTranscript(content);
        const chunks: ChunkInfo[] = [];
        let wordCount = 0;

        for (const segment of transcript.segments) {
          const cleanText = preprocessForTTS(segment.text);
          if (!cleanText.trim()) continue;
          wordCount += cleanText.split(/\s+/).length;
          const voice = getInterviewVoice(segment.speakerIndex, provider);
          for (const chunk of chunkText(cleanText, maxChars)) {
            chunks.push({ text: chunk, voice });
          }
        }

        return { chunks, wordCount };
      }

      // Standard (non-interview) mode
      const cleanText = preprocessForTTS(content);
      const chunks: ChunkInfo[] = chunkText(cleanText, maxChars).map((text) => ({ text }));
      return { chunks, wordCount: cleanText.split(/\s+/).length };
    });

    // One Inngest step per chunk — each TTS call is ~3-5s, well within Vercel's
    // 10s limit. Inngest memoizes completed steps on replay so the loop is safe.
    // Buffers can't cross step boundaries (JSON), so each chunk MP3 is written
    // to temporary Supabase storage and combined in the final step.
    for (let i = 0; i < chunks.length; i++) {
      const idx = i;
      await step.run(`generate-chunk-${idx}`, async () => {
        const { text, voice } = chunks[idx];

        const buf =
          provider === 'openai'
            ? await generateSpeechOpenAI(
                text,
                voice ?? (settings.openai_voice as string) ?? 'onyx',
                settings.openai_api_key as string,
              )
            : provider === 'inworld'
              ? await generateSpeechInworld(
                  text,
                  voice ?? (settings.inworld_voice as string) ?? 'Dennis',
                  settings.inworld_api_key as string,
                )
              : await generateSpeech(
                  text,
                  voice ?? (settings.elevenlabs_voice_id as string),
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
