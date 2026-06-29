'use client';

import { usePlayer } from './PlayerContext';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Gauge,
} from 'lucide-react';

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const RATES = [0.75, 1, 1.25, 1.5, 2];

export default function AudioPlayer() {
  const { episode, isPlaying, currentTime, duration, playbackRate, togglePlay, skip, seek, setRate } =
    usePlayer();

  if (!episode) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const rateIdx = RATES.indexOf(playbackRate);

  const cycleRate = () => {
    const next = RATES[(rateIdx + 1) % RATES.length];
    setRate(next);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur border-t border-slate-700 px-4 py-3 safe-bottom">
      {/* Progress bar */}
      <div
        className="h-1 bg-slate-700 rounded-full mb-3 cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          seek(pct * duration);
        }}
      >
        <div
          className="h-full bg-violet-500 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-4">
        {/* Title + source */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{episode.title}</p>
          {episode.source_url && (
            <p className="text-xs text-slate-400 truncate">
              {new URL(episode.source_url).hostname.replace('www.', '')}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 tabular-nums w-10 text-right">
            {formatTime(currentTime)}
          </span>

          <button
            onClick={() => skip(-15)}
            className="text-slate-300 hover:text-white transition-colors"
            aria-label="Back 15s"
          >
            <SkipBack size={20} />
          </button>

          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center text-white transition-colors"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>

          <button
            onClick={() => skip(30)}
            className="text-slate-300 hover:text-white transition-colors"
            aria-label="Forward 30s"
          >
            <SkipForward size={20} />
          </button>

          <span className="text-xs text-slate-400 tabular-nums w-10">
            {formatTime(duration)}
          </span>

          <button
            onClick={cycleRate}
            className="flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            aria-label="Change playback speed"
          >
            <Gauge size={14} />
            {playbackRate}×
          </button>
        </div>
      </div>
    </div>
  );
}
