export const INWORLD_VOICES = [
  'Sarah', 'Dennis', 'Oliver', 'Claire', 'Alex', 'Ashley', 'Julia', 'James',
  'Emma', 'Liam', 'Olivia', 'Noah', 'Victoria', 'Marcus', 'Mia', 'Ethan',
] as const;

export async function generateSpeechInworld(
  text: string,
  voice: string,
  apiKey: string,
): Promise<Buffer> {
  const response = await fetch('https://api.inworld.ai/tts/v1/voice', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voiceId: voice,
      modelId: 'inworld-tts-2',
      audioConfig: { audioEncoding: 'MP3' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Inworld TTS error ${response.status}: ${error}`);
  }

  const data = await response.json() as { audioContent: string };
  return Buffer.from(data.audioContent, 'base64');
}
