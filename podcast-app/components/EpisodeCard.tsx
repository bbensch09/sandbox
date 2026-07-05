'use client';

import { useState } from 'react';
import { Play, Pause, Trash2, Clock, AlertCircle, Loader2, Zap, Sparkles } from 'lucide-react';
import { usePlayer, Episode } from './PlayerContext';

const ELEVENLABS_COST_PER_CHAR = 0.00025; // $0.25 per 1000 chars
const OPENAI_COST_PER_CHAR = 0.00004;     // $0.04 per 1000 chars

function formatCost(chars: number, perChar: number): string {
  const cost = chars * perChar;
  return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`;
}

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
  if (status === 'ready' || status === 'awaiting_confirmation') return null;
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: {
      label: 'Queued',
      color: 'text-yellow-400 bg-yellow-400/10',
      icon: <Clock size={12} />,
    },
    extracting: {
      label: 'Extracting…',
      color: 'text-sky-400 bg-sky-400/10',
      icon: <Loader2 size={12} className="animate-spin" />,
    },
    processing: {
      label: 'Generating…',
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
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${info.color}`}>
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
  const [generating, setGenerating] = useState<'elevenlabs' | 'openai' | null>(null);
  const [genError, setGenError] = useState('');

  const isActive = current?.id === episode.id;
  const canPlay = episode.status === 'ready' && episode.audio_url;
  const awaitingConfirmation = episode.status === 'awaiting_confirmation';

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

  const handleGenerate = async (provider: 'elevenlabs' | 'openai') => {
    setGenerating(provider);
    setGenError('');
    try {
      const res = await fetch(`/api/episodes/${episode.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Error ${res.status}`);
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to start generation');
      setGenerating(null);
    }
  };

  const chars = episode.character_count ?? 0;

  return (
    <div
      className={`group flex items-start gap-4 p-4 rounded-xl border transition-colors
        ${awaitingConfirmation
          ? 'bg-amber-950/20 border-amber-700/50'
          : isActive
            ? 'bg-violet-950/40 border-violet-700'
            : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
        } ${canPlay ? 'cursor-pointer' : ''}`}
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
        {isActive && isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
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
            <span className="text-xs text-slate-500">{formatDuration(episode.duration_seconds)}</span>
          )}
          <span className="text-xs text-slate-600">{formatDate(episode.created_at)}</span>
          <StatusBadge status={episode.status} />
        </div>

        {episode.status === 'failed' && episode.error_message && (
          <p className="text-xs text-red-400 mt-1 line-clamp-1">{episode.error_message}</p>
        )}

        {/* Cost confirmation UI */}
        {awaitingConfirmation && (
          <div
            className="mt-3 rounded-xl p-3 space-y-2.5"
            onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(251,191,36,0.2)' }}
          >
            <p className="text-xs font-medium" style={{ color: '#fbbf24' }}>
              Ready to convert · {chars.toLocaleString()} chars
            </p>

            {genError && (
              <p className="text-xs text-red-400">{genError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => handleGenerate('openai')}
                disabled={generating !== null}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
              >
                {generating === 'openai' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Zap size={12} />
                )}
                OpenAI TTS · {formatCost(chars, OPENAI_COST_PER_CHAR)}
              </button>

              <button
                onClick={() => handleGenerate('elevenlabs')}
                disabled={generating !== null}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'rgba(124,58,237,0.2)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.3)' }}
              >
                {generating === 'elevenlabs' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                ElevenLabs · {formatCost(chars, ELEVENLABS_COST_PER_CHAR)}
              </button>
            </div>
          </div>
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
