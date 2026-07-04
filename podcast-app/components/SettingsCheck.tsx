'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';

export default function SettingsCheck() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setHasKey(d.has_api_key))
      .catch(() => setHasKey(false));
  }, []);

  if (hasKey !== false) return null;

  return (
    <div className="mb-6 flex items-center gap-3 bg-amber-950/40 border border-amber-700/50 text-amber-300 rounded-xl p-4 text-sm">
      <Settings size={18} className="flex-shrink-0" />
      <span>
        ElevenLabs API key not configured.{' '}
        <Link href="/settings" className="underline font-medium hover:text-amber-200">
          Go to Settings
        </Link>{' '}
        to add it before adding articles.
      </span>
    </div>
  );
}
