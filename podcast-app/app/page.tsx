'use client';

import { useEffect, useState, useCallback } from 'react';
import EpisodeCard from '@/components/EpisodeCard';
import SettingsCheck from '@/components/SettingsCheck';
import { Episode } from '@/components/PlayerContext';
import { createClientSupabase } from '@/lib/supabase-client';
import { Headphones } from 'lucide-react';

export default function Home() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEpisodes = useCallback(async () => {
    const res = await fetch('/api/episodes');
    if (res.ok) setEpisodes(await res.json());
    setLoading(false);
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
