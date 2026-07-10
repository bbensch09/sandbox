'use client';

import { useState } from 'react';
import { Play, Pause, Trash2, Clock, AlertCircle, Loader2, Zap, Sparkles, RotateCcw, Mic2 } from 'lucide-react';
import { OPENAI_INTERVIEW_VOICES } from '@/lib/transcript';
import { usePlayer, Episode } from './PlayerContext';

const ELEVENLABS_COST_PER_CHAR = 0.00025; // $0.25 per 1000 chars
const OPENAI_COST_PER_CHAR = 0.00004;     // $0.04 per 1000 chars
const INWORLD_COST_PER_CHAR = 0.000025;   // $0.025 per 1000 chars (TTS-2)

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
  const [generating, setGenerating] = useState<'elevenlabs' | 'openai' | 'inworld' | null>(null);
  const [genError, setGenError] = useState('');
  const [retrying, setRetrying] = useState(false);

  const isActive = current?.id === episode.id;
  const canPlay = episode.status === 'ready' && episode.audio_url;
  const awaitingConfirmation = episode.status === 'awaiting_confirmation';

  const IN_PROGRESS = new Set(['pending', 'extracting', 'processing']);
  const TEN_MIN_MS = 10 * 60 * 1000;
  const ageMs = Date.now() - new Date(episode.created_at).getTime();
  const canRetry =
    episode.status === 'failed' ||
    (IN_PROGRESS.has(episode.status) && ageMs > TEN_MIN_MS);

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

  const handleGenerate = async (provider: 'elevenlabs' | 'openai' | 'inworld') => {
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

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await fetch(`/api/episodes/${episode.id}/retry`, { method: 'POST' });
    } finally {
      setRetrying(false);
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
          {episode.is_interview && (
            <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full" style={{ color: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.1)' }}>
              <Mic2 size={10} />
              Interview
            </span>
          )}
          <StatusBadge status={episode.status} />
        </div>

        {episode.status === 'failed' && episode.error_message && (
          <p className="text-xs text-red-400 mt-1 line-clamp-1">{episode.error_message}</p>
        )}

        {/* Retry button */}
        {canRetry && (
          <button
            onClick={(e) => { e.stopPropagation(); handleRetry(); }}
            disabled={retrying}
            className="inline-flex items-center gap-1.5 mt-2 text-xs px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
            style={{ color: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.2)' }}
          >
            {retrying ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}

        {/* Cost confirmation UI */}
        {awaitingConfirmation && (
          <div
            className="mt-3 rounded-xl p-3 space-y-2.5"
            onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(251,191,36,0.2)' }}
          >
            {/* Summary line */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {episode.is_interview && <Mic2 size={12} style={{ color: '#fbbf24' }} />}
              <p className="text-xs font-medium" style={{ color: '#fbbf24' }}>
                Ready to convert · {chars.toLocaleString()} chars
                {episode.is_interview && episode.speaker_count
                  ? ` · ${episode.speaker_count} speaker${episode.speaker_count !== 1 ? 's' : ''}`
                  : ''}
              </p>
            </div>

            {/* Warning for >4 speakers */}
            {episode.is_interview && episode.speaker_count && episode.speaker_count > 4 && (
              <p className="text-xs rounded-lg px-2.5 py-1.5" style={{ color: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)' }}>
                ⚠ {episode.speaker_count} speakers detected — Inworld supports 4 distinct voices; OpenAI & ElevenLabs support 3. Extra speakers will reuse the first voice.
              </p>
            )}

            {genError && <p className="text-xs text-red-400">{genError}</p>}

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => handleGenerate('inworld')}
                  disabled={generating !== null}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'rgba(20,184,166,0.15)', color: '#5eead4', border: '1px solid rgba(20,184,166,0.3)' }}
                >
                  {generating === 'inworld' ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                  Inworld · {formatCost(chars, INWORLD_COST_PER_CHAR)}
                </button>

                <button
                  onClick={() => handleGenerate('openai')}
                  disabled={generating !== null}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
                >
                  {generating === 'openai' ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                  OpenAI · {formatCost(chars, OPENAI_COST_PER_CHAR)}
                </button>
              </div>

              <button
                onClick={() => handleGenerate('elevenlabs')}
                disabled={generating !== null}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'rgba(124,58,237,0.2)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.3)' }}
              >
                {generating === 'elevenlabs' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
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
