'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';

export default function SettingsCheck() {
  // null = unknown (not loaded, or the settings API itself is unreachable)
  const [hasAnyKey, setHasAnyKey] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setHasAnyKey(
          !!(d.has_elevenlabs_key || d.has_openai_key || d.has_inworld_key),
        );
      })
      .catch(() => {
        // Leave as unknown — the library error banner reports connectivity.
      });
  }, []);

  if (hasAnyKey !== false) return null;

  return (
    <div className="mb-6 flex items-center gap-3 bg-amber-950/40 border border-amber-700/50 text-amber-300 rounded-xl p-4 text-sm">
      <Settings size={18} className="flex-shrink-0" />
      <span>
        No TTS provider key configured.{' '}
        <Link href="/settings" className="underline font-medium hover:text-amber-200">
          Go to Settings
        </Link>{' '}
        to add an Inworld, OpenAI, or ElevenLabs key before adding articles.
      </span>
    </div>
  );
}
