export interface TranscriptSegment {
  speaker: string;
  text: string;
  speakerIndex: number; // 0-based, maps to voice
}

export interface ParsedTranscript {
  segments: TranscriptSegment[];
  speakerOrder: string[]; // speakers in first-appearance order
  speakerCount: number;
}

// OpenAI voices assigned by speaker order in an interview
export const OPENAI_INTERVIEW_VOICES = ['fable', 'onyx', 'nova'] as const;

// ElevenLabs built-in voice IDs for interview mode (no pro required)
export const ELEVENLABS_INTERVIEW_VOICE_IDS = [
  'pNInz6obpgDQGcFmaJgB', // Adam
  '21m00Tcm4TlvDq8ikWAM', // Rachel
  'IKne3meq5aSn9XLyUdCD', // Charlie
] as const;

// Inworld standard voices for interview mode (4 distinct voices)
export const INWORLD_INTERVIEW_VOICES = ['Sarah', 'Dennis', 'Oliver', 'Claire'] as const;

export function getInterviewVoice(
  speakerIndex: number,
  provider: 'openai' | 'elevenlabs' | 'inworld',
): string {
  if (provider === 'inworld') {
    return INWORLD_INTERVIEW_VOICES[Math.min(speakerIndex, 3)];
  }
  const idx = Math.min(speakerIndex, 2); // cap at index 2 for 3 voices
  return provider === 'openai'
    ? OPENAI_INTERVIEW_VOICES[idx]
    : ELEVENLABS_INTERVIEW_VOICE_IDS[idx];
}

/**
 * Parse an interview transcript into per-speaker segments.
 *
 * Handles common formats:
 *   "Name: text..."          (each line or paragraph)
 *   "**Name:** text..."      (markdown bold label)
 *   "[00:01:23] Name: text"  (timestamped)
 *   "Q: ... / A: ..."        (Q&A)
 *
 * Returns a single-segment "Narrator" result if no clear speaker pattern found.
 */
export function parseTranscript(text: string): ParsedTranscript {
  // Normalize before parsing
  const normalized = text
    .replace(/\r\n/g, '\n')
    // Strip markdown bold from speaker labels: **Name:** or **Name**:
    .replace(/\*\*([^*\n]{1,60})\*\*:/g, '$1:')
    // Strip leading timestamps: [00:00] or (00:00:00) or 00:00 at line start
    .replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/gm, '');

  // Match "Speaker Name: " at start of a line.
  // Speaker: 1–50 chars starting with a letter, no colons or newlines in name.
  const markerRegex = /^([A-Za-zÀ-ÿ][^:\n\r]{0,49}):\s+/gm;

  const markers: Array<{ speaker: string; pos: number; contentStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = markerRegex.exec(normalized)) !== null) {
    markers.push({
      speaker: m[1].trim(),
      pos: m.index,
      contentStart: m.index + m[0].length,
    });
  }

  // Need at least 3 turns to look like a transcript
  if (markers.length < 3) {
    return {
      segments: [{ speaker: 'Narrator', text, speakerIndex: 0 }],
      speakerOrder: ['Narrator'],
      speakerCount: 1,
    };
  }

  // Count occurrences per candidate speaker
  const counts: Record<string, number> = {};
  for (const mk of markers) {
    counts[mk.speaker] = (counts[mk.speaker] ?? 0) + 1;
  }

  // Filter noise: keep only speakers that appear ≥ 2 times
  let validSpeakers = new Set(
    Object.entries(counts)
      .filter(([, c]) => c >= 2)
      .map(([s]) => s),
  );

  // If nothing passes the threshold (very short interview), relax to ≥ 1
  if (validSpeakers.size === 0) {
    validSpeakers = new Set(Object.keys(counts));
  }

  // Build speaker order by first appearance
  const speakerOrder: string[] = [];
  for (const mk of markers) {
    if (validSpeakers.has(mk.speaker) && !speakerOrder.includes(mk.speaker)) {
      speakerOrder.push(mk.speaker);
    }
  }

  // Extract text for each turn
  const segments: TranscriptSegment[] = [];
  for (let i = 0; i < markers.length; i++) {
    const mk = markers[i];
    if (!validSpeakers.has(mk.speaker)) continue;

    const textEnd = i < markers.length - 1 ? markers[i + 1].pos : normalized.length;
    const segText = normalized
      .slice(mk.contentStart, textEnd)
      .trim()
      .replace(/\s+/g, ' ');

    if (!segText) continue;

    segments.push({
      speaker: mk.speaker,
      text: segText,
      speakerIndex: speakerOrder.indexOf(mk.speaker),
    });
  }

  return { segments, speakerOrder, speakerCount: speakerOrder.length };
}
