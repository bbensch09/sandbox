'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import EpisodeCard from '@/components/EpisodeCard';
import SettingsCheck from '@/components/SettingsCheck';
import { Episode } from '@/components/PlayerContext';
import { createClientSupabase } from '@/lib/supabase-client';
import { Headphones, RefreshCw, AlertCircle } from 'lucide-react';

const POLL_INTERVAL_MS = 30_000; // 30s × 10 = 5 min max
const MAX_POLLS = 10;
const IN_PROGRESS = new Set(['pending', 'extracting', 'processing']);

export default function Home() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStuckBanner, setShowStuckBanner] = useState(false);
  const [loadError, setLoadError] = useState('');
  const pollCountRef = useRef(0);

  // A failed load must not fall through to the "No episodes yet" empty state —
  // that silently disguises an outage (paused database, missing env vars) as an
  // empty library.
  const loadEpisodes = useCallback(async () => {
    try {
      const res = await fetch('/api/episodes');
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Server returned ${res.status}`);
      }
      setEpisodes(await res.json());
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEpisodes();
  }, [loadEpisodes]);

  // Supabase Realtime — live status updates while episode processes
  useEffect(() => {
    const supabase = createClientSupabase();
    const channel = supabase
      .channel('episodes-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'episodes' },
        (payload) => {
          setEpisodes((prev) =>
            prev.map((ep) =>
              ep.id === payload.new.id ? { ...ep, ...(payload.new as Episode) } : ep,
            ),
          );
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Polling fallback — fires every 30s when any episode is in-progress.
  // Realtime handles the fast path; this catches cases where it fails to fire.
  // After 10 attempts (~5 min) with no progress, show a manual refresh nudge.
  useEffect(() => {
    const inProgress = episodes.some((ep) => IN_PROGRESS.has(ep.status));

    if (!inProgress) {
      pollCountRef.current = 0;
      setShowStuckBanner(false);
      return;
    }

    if (pollCountRef.current >= MAX_POLLS) return;

    const id = setTimeout(async () => {
      try {
        const res = await fetch('/api/episodes');
        if (!res.ok) return;
        const fresh: Episode[] = await res.json();
        setEpisodes(fresh);
        pollCountRef.current += 1;

        if (pollCountRef.current >= MAX_POLLS && fresh.some((ep) => IN_PROGRESS.has(ep.status))) {
          setShowStuckBanner(true);
        }
      } catch {
        // Network error — silently skip, will retry on next render
      }
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(id);
  }, [episodes]);

  const handleDelete = (id: string) =>
    setEpisodes((prev) => prev.filter((ep) => ep.id !== id));

  return (
    <>
      <SettingsCheck />

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-white">Your Library</h1>
        <span className="text-sm" style={{ color: '#64748b' }}>
          {episodes.length} episode{episodes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {showStuckBanner && (
        <div
          className="flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-xl text-sm"
          style={{
            backgroundColor: 'rgba(234,179,8,0.08)',
            border: '1px solid rgba(234,179,8,0.25)',
            color: '#fbbf24',
          }}
        >
          <span>Still processing after 5 min — something may be stuck.</span>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 font-medium flex-shrink-0"
            style={{ color: '#fbbf24' }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-xl animate-pulse"
              style={{ backgroundColor: 'rgba(30,41,59,0.5)' }}
            />
          ))}
        </div>
      ) : loadError ? (
        <div
          className="rounded-xl px-4 py-4 text-sm"
          style={{
            backgroundColor: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            color: '#fca5a5',
          }}
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle size={16} className="flex-shrink-0" />
            Couldn&apos;t load your library
          </div>
          <p className="mt-1.5 text-xs break-words" style={{ color: '#f87171' }}>
            {loadError}
          </p>
          <p className="mt-2 text-xs" style={{ color: '#94a3b8' }}>
            Your episodes are still saved. This usually means the database is
            unreachable — a Supabase free-tier project pauses after inactivity and
            needs resuming from the dashboard.
          </p>
          <button
            onClick={() => { setLoading(true); loadEpisodes(); }}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg"
            style={{ color: '#fca5a5', backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <RefreshCw size={12} />
            Try again
          </button>
        </div>
      ) : episodes.length === 0 ? (
        <div className="text-center py-20" style={{ color: '#64748b' }}>
          <Headphones size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium" style={{ color: '#94a3b8' }}>No episodes yet</p>
          <p className="text-sm mt-1">Add an article URL to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {episodes.map((ep) => (
            <EpisodeCard key={ep.id} episode={ep} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </>
  );
}
