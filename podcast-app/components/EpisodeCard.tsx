'use client';

import { useState } from 'react';
import { Play, Pause, Trash2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { usePlayer, Episode } from './PlayerContext';

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ready') return null;
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: {
      label: 'Queued',
      color: 'text-yellow-400 bg-yellow-400/10',
      icon: <Clock size={12} />,
    },
    processing: {
      label: 'Processing…',
      color: 'text-blue-400 bg-blue-400/10',
      icon: <Loader2 size={12} className="animate-spin" />,
    },
    failed: {
      label: 'Failed',
      color: 'text-red-400 bg-red-400/10',
      icon: <AlertCircle size={12} />,
    },
  };
  const info = map[status] ?? map.pending;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${info.color}`}
    >
      {info.icon}
      {info.label}
    </span>
  );
}

interface Props {
  episode: Episode;
  onDelete: (id: string) => void;
}

export default function EpisodeCard({ episode, onDelete }: Props) {
  const { play, togglePlay, episode: current, isPlaying } = usePlayer();
  const [deleting, setDeleting] = useState(false);

  const isActive = current?.id === episode.id;
  const canPlay = episode.status === 'ready' && episode.audio_url;

  const handlePlay = () => {
    if (!canPlay) return;
    if (isActive) {
      togglePlay();
    } else {
      play(episode);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this episode?')) return;
    setDeleting(true);
    await fetch(`/api/episodes/${episode.id}`, { method: 'DELETE' });
    onDelete(episode.id);
  };

  return (
    <div
      className={`group flex items-start gap-4 p-4 rounded-xl border transition-colors cursor-pointer
        ${isActive
          ? 'bg-violet-950/40 border-violet-700'
          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
        }`}
      onClick={handlePlay}
    >
      {/* Play button */}
      <button
        className={`mt-0.5 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors
          ${canPlay
            ? isActive
              ? 'bg-violet-600 text-white'
              : 'bg-slate-700 group-hover:bg-violet-600 text-slate-300 group-hover:text-white'
            : 'bg-slate-700/50 text-slate-600 cursor-default'
          }`}
        onClick={(e) => { e.stopPropagation(); handlePlay(); }}
        disabled={!canPlay}
        aria-label={isActive && isPlaying ? 'Pause' : 'Play'}
      >
        {isActive && isPlaying ? (
          <Pause size={16} />
        ) : (
          <Play size={16} className="ml-0.5" />
        )}
      </button>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white leading-snug line-clamp-2">{episode.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {episode.source_url && (
            <span className="text-xs text-slate-400">
              {new URL(episode.source_url).hostname.replace('www.', '')}
            </span>
          )}
          {episode.duration_seconds && (
            <span className="text-xs text-slate-500">
              {formatDuration(episode.duration_seconds)}
            </span>
          )}
          <span className="text-xs text-slate-600">{formatDate(episode.created_at)}</span>
          <StatusBadge status={episode.status} />
        </div>
        {episode.status === 'failed' && episode.error_message && (
          <p className="text-xs text-red-400 mt-1 line-clamp-1">{episode.error_message}</p>
        )}
      </div>

      {/* Delete */}
      <button
        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1"
        onClick={(e) => { e.stopPropagation(); handleDelete(); }}
        disabled={deleting}
        aria-label="Delete episode"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
