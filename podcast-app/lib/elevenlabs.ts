export interface Voice {
  voice_id: string;
  name: string;
  preview_url?: string;
  category?: string;
}

export async function generateSpeech(
  text: string,
  voiceId: string,
  apiKey: string,
): Promise<Buffer> {
  const response = await fetch(
    // 64kbps keeps long episodes under Supabase's 50 MB per-file upload limit
    // (the 128kbps default overflows it at ~55 minutes of audio).
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey.trim(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs error ${response.status}: ${await readElevenLabsError(response)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ElevenLabs wraps errors as {"detail":{"status":"...","message":"..."}};
// pull out the human-readable message so it isn't lost behind raw JSON.
async function readElevenLabsError(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  try {
    const detail = JSON.parse(body)?.detail;
    if (typeof detail === 'string') return detail;
    if (detail?.message) return detail.status ? `${detail.status}: ${detail.message}` : detail.message;
  } catch {}
  return body || 'no detail';
}

export async function fetchVoices(apiKey: string): Promise<Voice[]> {
  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey.trim() },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ElevenLabs ${response.status}: ${body || 'no detail'}`);
  }

  const data = await response.json();
  return data.voices as Voice[];
}

/**
 * Split a fragment that is already over the limit, breaking on word
 * boundaries and hard-slicing any single token still too long.
 * Every returned piece is guaranteed <= maxChars.
 */
function splitToLimit(fragment: string, maxChars: number): string[] {
  if (fragment.length <= maxChars) return [fragment];

  const pieces: string[] = [];
  let buf = '';

  for (const word of fragment.split(/\s+/)) {
    if (!word) continue;

    // A single token longer than the limit (URL, run-on string) — hard slice.
    if (word.length > maxChars) {
      if (buf) { pieces.push(buf); buf = ''; }
      for (let i = 0; i < word.length; i += maxChars) {
        pieces.push(word.slice(i, i + maxChars));
      }
      continue;
    }

    if (buf.length + word.length + 1 > maxChars) {
      pieces.push(buf);
      buf = word;
    } else {
      buf = buf ? buf + ' ' + word : word;
    }
  }

  if (buf) pieces.push(buf);
  return pieces;
}

export function chunkText(text: string, maxChars = 4500): string[] {
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const t = current.trim();
    if (t) chunks.push(t);
    current = '';
  };

  // Match each sentence (text ending with punctuation). Text with no terminal
  // punctuation falls back to one fragment, which splitToLimit then breaks up —
  // without that, a single oversized "sentence" would be sent to the TTS API
  // whole and rejected (e.g. OpenAI's 4096 and Inworld's 2000 char limits).
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];

  for (const sentence of sentences) {
    for (const piece of splitToLimit(sentence, maxChars)) {
      if (current.length + piece.length + 1 > maxChars && current.length > 0) {
        flush();
        current = piece;
      } else {
        current = current ? current + ' ' + piece : piece;
      }
    }
  }

  flush();
  return chunks;
}

export function preprocessForTTS(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
