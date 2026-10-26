'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayer, SKIP_SECONDS } from './PlayerContext';
import {
  Play, Pause, RotateCcw, RotateCw, Moon, X, ListOrdered, ChevronDown, Headphones, SkipForward,
} from 'lucide-react';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

const SLEEP_OPTIONS = [
  { label: 'End of episode', minutes: 0 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hour', minutes: 60 },
];

interface SleepTimer {
  label: string;
  endsAt: number | 'episode';
}

/** Circular-arrow skip button with the seconds printed inside, as in Podcasts/Spotify. */
function SkipButton({ direction, onClick, size }: { direction: 'back' | 'forward'; onClick: () => void; size: number }) {
  const Icon = direction === 'back' ? RotateCcw : RotateCw;
  return (
    <button
      onClick={onClick}
      className="relative flex items-center justify-center rounded-full active:scale-95 transition-transform"
      style={{ color: '#e2e8f0', width: size + 20, height: size + 20 }}
      aria-label={direction === 'back' ? `Back ${SKIP_SECONDS} seconds` : `Forward ${SKIP_SECONDS} seconds`}
    >
      <Icon size={size} strokeWidth={1.75} />
      <span className="absolute font-semibold tabular-nums" style={{ fontSize: size * 0.3, marginTop: 2 }}>
        {SKIP_SECONDS}
      </span>
    </button>
  );
}

export default function AudioPlayer() {
  const {
    episode, isPlaying, currentTime, duration, playbackRate, togglePlay, skip, seek, setRate, audioRef,
    queue, play, removeFromQueue, skipToNext, setStopAfterEpisode,
  } = usePlayer();

  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState<'none' | 'sleep' | 'queue'>('none');
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const [sleepTimer, setSleepTimer] = useState<SleepTimer | null>(null);
  const [sleepCountdown, setSleepCountdown] = useState('');
  const sleepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const swipeStartRef = useRef<number | null>(null);

  const shownTime = scrubbing ?? currentTime;
  const progress = duration > 0 ? (shownTime / duration) * 100 : 0;

  // Full-screen player owns the screen: stop the library scrolling underneath.
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [expanded]);

  const startSleepTimer = (minutes: number, label: string) => {
    if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current);
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);

    if (minutes === 0) {
      setSleepTimer({ label, endsAt: 'episode' });
      setSleepCountdown('');
    } else {
      const endsAt = Date.now() + minutes * 60 * 1000;
      setSleepTimer({ label, endsAt });
      setSleepCountdown(formatCountdown(endsAt - Date.now()));

      sleepIntervalRef.current = setInterval(() => {
        const remaining = endsAt - Date.now();
        if (remaining <= 0) {
          clearInterval(sleepIntervalRef.current!);
          setSleepCountdown('');
        } else {
          setSleepCountdown(formatCountdown(remaining));
        }
      }, 1000);

      sleepTimeoutRef.current = setTimeout(() => {
        const audio = audioRef.current;
        if (audio && !audio.paused) audio.pause();
        setSleepTimer(null);
        setSleepCountdown('');
      }, minutes * 60 * 1000);
    }

    setPanel('none');
  };

  const cancelSleepTimer = () => {
    if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current);
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    setSleepTimer(null);
    setSleepCountdown('');
  };

  // Clear "end of episode" timer when episode naturally finishes
  useEffect(() => {
    if (!isPlaying && sleepTimer?.endsAt === 'episode' && currentTime === 0) {
      setSleepTimer(null);
    }
  }, [isPlaying, currentTime, sleepTimer]);

  // "End of episode" means stop there, not roll on into the queue
  useEffect(() => {
    setStopAfterEpisode(sleepTimer?.endsAt === 'episode');
  }, [sleepTimer, setStopAfterEpisode]);

  useEffect(() => {
    return () => {
      if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current);
      if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    };
  }, []);

  if (!episode) return null;

  const host = episode.source_url ? new URL(episode.source_url).hostname.replace('www.', '') : '';
  const cycleRate = () => setRate(RATES[(RATES.indexOf(playbackRate) + 1) % RATES.length] ?? 1);

  // ── Mini player ───────────────────────────────────────────────────────────
  // Only two targets — "open the player" and play/pause — both large, so a
  // stray thumb near the bottom of the library can't start a different episode.
  const mini = (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t safe-bottom"
      style={{ backgroundColor: 'rgba(10,15,30,0.97)', backdropFilter: 'blur(16px)', borderColor: 'rgb(51,65,85)' }}
    >
      <div className="h-1" style={{ backgroundColor: 'rgb(51,65,85)' }}>
        <div className="h-full" style={{ width: `${progress}%`, backgroundColor: '#7c3aed' }} />
      </div>
      <div className="max-w-2xl mx-auto flex items-center">
        <button
          onClick={() => setExpanded(true)}
          className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-2 py-3 text-left"
          aria-label="Open player"
        >
          <div className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#7c3aed,#4c1d95)' }}>
            <Headphones size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate leading-tight">{episode.title}</p>
            <p className="text-xs truncate mt-0.5" style={{ color: queue.length ? '#a78bfa' : '#94a3b8' }}>
              {queue.length ? `Next: ${queue[0].title}` : `${formatTime(currentTime)} / ${formatTime(duration)}${host ? ` · ${host}` : ''}`}
            </p>
          </div>
        </button>
        <button
          onClick={togglePlay}
          className="flex-shrink-0 w-12 h-12 mr-3 rounded-full flex items-center justify-center text-white"
          style={{ backgroundColor: '#7c3aed' }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>
      </div>
    </div>
  );

  if (!expanded) return mini;

  // ── Full-screen player ────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[55] flex flex-col safe-top safe-bottom"
      style={{ backgroundColor: '#0a0f1e' }}
      role="dialog"
      aria-label="Now playing"
    >
      {/* Swipe down on the top half to close, like Apple Podcasts */}
      <div
        onTouchStart={(e) => { swipeStartRef.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          const start = swipeStartRef.current;
          swipeStartRef.current = null;
          if (start != null && e.changedTouches[0].clientY - start > 80) setExpanded(false);
        }}
      >
        <div className="max-w-md mx-auto w-full flex items-center justify-between px-4 pt-2">
          <button onClick={() => setExpanded(false)} className="p-2 -ml-2" style={{ color: '#cbd5e1' }} aria-label="Close player">
            <ChevronDown size={28} />
          </button>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Now Playing</span>
          <span className="w-10" />
        </div>

        <div className="max-w-md mx-auto w-full px-8 pt-4">
          <div
            className="mx-auto aspect-square w-full max-w-[260px] max-h-[32vh] rounded-3xl flex items-center justify-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#312e81)' }}
          >
            <Headphones size={72} className="text-white/90" />
          </div>
          <h2 className="mt-6 text-xl font-semibold text-white leading-snug line-clamp-3">{episode.title}</h2>
          {host && (
            <a href={episode.source_url} target="_blank" rel="noreferrer" className="text-sm mt-1 inline-block" style={{ color: '#a78bfa' }}>
              {host}
            </a>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto w-full px-8 pt-5">
        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={Math.min(shownTime, duration || 0)}
          onChange={(e) => setScrubbing(Number(e.target.value))}
          onPointerUp={() => { if (scrubbing != null) { seek(scrubbing); setScrubbing(null); } }}
          onKeyUp={() => { if (scrubbing != null) { seek(scrubbing); setScrubbing(null); } }}
          className="w-full scrubber"
          style={{ ['--progress' as string]: `${progress}%` }}
          aria-label="Seek"
        />
        <div className="flex justify-between text-xs tabular-nums mt-1" style={{ color: '#94a3b8' }}>
          <span>{formatTime(shownTime)}</span>
          <span>-{formatTime(Math.max(0, duration - shownTime))}</span>
        </div>

        {/* Transport */}
        <div className="flex items-center justify-center gap-8 mt-5">
          <SkipButton direction="back" size={34} onClick={() => skip(-SKIP_SECONDS)} />
          <button
            onClick={togglePlay}
            className="w-20 h-20 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
            style={{ backgroundColor: '#7c3aed' }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={34} /> : <Play size={34} className="ml-1" />}
          </button>
          <SkipButton direction="forward" size={34} onClick={() => skip(SKIP_SECONDS)} />
        </div>

        {/* Secondary controls */}
        <div className="flex items-center justify-around mt-6">
          <button onClick={cycleRate} className="px-3 py-2 rounded-lg text-sm font-semibold tabular-nums" style={{ color: playbackRate !== 1 ? '#a78bfa' : '#cbd5e1' }} aria-label="Playback speed">
            {playbackRate}×
          </button>
          <button
            onClick={() => setPanel((p) => (p === 'sleep' ? 'none' : 'sleep'))}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm"
            style={{ color: sleepTimer ? '#a78bfa' : '#cbd5e1', backgroundColor: panel === 'sleep' ? 'rgba(124,58,237,0.15)' : 'transparent' }}
            aria-label="Sleep timer"
          >
            <Moon size={18} />
            {sleepCountdown || (sleepTimer?.endsAt === 'episode' ? 'End' : '')}
          </button>
          <button
            onClick={() => setPanel((p) => (p === 'queue' ? 'none' : 'queue'))}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm"
            style={{ color: queue.length ? '#a78bfa' : '#cbd5e1', backgroundColor: panel === 'queue' ? 'rgba(124,58,237,0.15)' : 'transparent' }}
            aria-label={`Up next (${queue.length})`}
          >
            <ListOrdered size={18} />
            {queue.length > 0 && queue.length}
          </button>
          {queue.length > 0 && (
            <button onClick={skipToNext} className="px-3 py-2" style={{ color: '#cbd5e1' }} aria-label="Play next in queue">
              <SkipForward size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Sleep timer / Up Next */}
      <div className="max-w-md mx-auto w-full px-4 mt-3 flex-1 min-h-0 overflow-y-auto">
        {panel === 'sleep' && (
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'rgb(15,23,42)', border: '1px solid rgb(51,65,85)' }}>
            {SLEEP_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => startSleepTimer(opt.minutes, opt.label)}
                className="w-full text-left px-4 py-3 text-sm"
                style={{ color: sleepTimer?.label === opt.label ? '#a78bfa' : '#e2e8f0', fontWeight: sleepTimer?.label === opt.label ? 600 : 400 }}
              >
                {opt.label}
              </button>
            ))}
            {sleepTimer && (
              <button onClick={() => { cancelSleepTimer(); setPanel('none'); }} className="w-full flex items-center gap-2 px-4 py-3 text-sm border-t" style={{ color: '#f87171', borderColor: 'rgb(51,65,85)' }}>
                <X size={14} /> Cancel timer
              </button>
            )}
          </div>
        )}

        {panel === 'queue' && (
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'rgb(15,23,42)', border: '1px solid rgb(51,65,85)' }}>
            <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Up Next</p>
            {queue.length === 0 ? (
              <p className="px-4 pb-3 text-sm" style={{ color: '#94a3b8' }}>
                Nothing queued. Long-press an episode in your library to add it.
              </p>
            ) : (
              <ul>
                {queue.map((ep, i) => (
                  <li key={ep.id} className="flex items-center gap-2 pl-4 pr-2">
                    <span className="text-xs tabular-nums w-4" style={{ color: '#64748b' }}>{i + 1}</span>
                    <button onClick={() => play(ep)} className="flex-1 min-w-0 text-left py-3 text-sm truncate" style={{ color: '#e2e8f0' }}>
                      {ep.title}
                    </button>
                    <button onClick={() => removeFromQueue(ep.id)} className="p-2" style={{ color: '#64748b' }} aria-label={`Remove ${ep.title} from queue`}>
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
