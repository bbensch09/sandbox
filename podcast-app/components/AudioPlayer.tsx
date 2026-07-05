'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayer } from './PlayerContext';
import { Play, Pause, SkipBack, SkipForward, Moon, X } from 'lucide-react';

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const RATES = [0.75, 1, 1.25, 1.5, 2];

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

export default function AudioPlayer() {
  const { episode, isPlaying, currentTime, duration, playbackRate, togglePlay, skip, seek, setRate, audioRef } =
    usePlayer();

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<SleepTimer | null>(null);
  const [sleepCountdown, setSleepCountdown] = useState('');
  const sleepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const sleepMenuRef = useRef<HTMLDivElement>(null);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
      if (sleepMenuRef.current && !sleepMenuRef.current.contains(e.target as Node)) {
        setShowSleepMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sleep timer: fire pause when time expires
  const startSleepTimer = (minutes: number, label: string) => {
    // Clear any existing timer
    if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current);
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);

    if (minutes === 0) {
      setSleepTimer({ label, endsAt: 'episode' });
      setSleepCountdown('');
    } else {
      const endsAt = Date.now() + minutes * 60 * 1000;
      setSleepTimer({ label, endsAt });
      setSleepCountdown(formatCountdown(endsAt - Date.now()));

      // Countdown tick
      sleepIntervalRef.current = setInterval(() => {
        const remaining = endsAt - Date.now();
        if (remaining <= 0) {
          clearInterval(sleepIntervalRef.current!);
          setSleepCountdown('');
        } else {
          setSleepCountdown(formatCountdown(remaining));
        }
      }, 1000);

      // Pause when timer fires
      sleepTimeoutRef.current = setTimeout(() => {
        const audio = audioRef.current;
        if (audio && !audio.paused) audio.pause();
        setSleepTimer(null);
        setSleepCountdown('');
      }, minutes * 60 * 1000);
    }

    setShowSleepMenu(false);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current);
      if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    };
  }, []);

  if (!episode) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t safe-bottom"
      style={{
        backgroundColor: 'rgba(10,15,30,0.97)',
        backdropFilter: 'blur(16px)',
        borderColor: 'rgb(51,65,85)',
      }}
    >
      {/* Progress bar */}
      <div
        className="h-1 cursor-pointer"
        style={{ backgroundColor: 'rgb(51,65,85)' }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seek(((e.clientX - rect.left) / rect.width) * duration);
        }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${progress}%`, backgroundColor: '#7c3aed', transition: 'width 0.25s linear' }}
        />
      </div>

      <div className="px-4 py-3 flex items-center gap-3">
        {/* Title + source */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate leading-tight">{episode.title}</p>
          {episode.source_url && (
            <p className="text-xs truncate mt-0.5" style={{ color: '#94a3b8' }}>
              {new URL(episode.source_url).hostname.replace('www.', '')}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2.5">
          {/* Elapsed */}
          <span className="text-xs tabular-nums w-9 text-right" style={{ color: '#94a3b8' }}>
            {formatTime(currentTime)}
          </span>

          {/* Skip back */}
          <button
            onClick={() => skip(-15)}
            className="transition-colors"
            style={{ color: '#cbd5e1' }}
            aria-label="Back 15s"
          >
            <SkipBack size={20} />
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors"
            style={{ backgroundColor: '#7c3aed' }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>

          {/* Skip forward */}
          <button
            onClick={() => skip(30)}
            className="transition-colors"
            style={{ color: '#cbd5e1' }}
            aria-label="Forward 30s"
          >
            <SkipForward size={20} />
          </button>

          {/* Remaining */}
          <span className="text-xs tabular-nums w-9" style={{ color: '#94a3b8' }}>
            {formatTime(duration)}
          </span>

          {/* Speed picker */}
          <div className="relative" ref={speedMenuRef}>
            <button
              onClick={() => { setShowSpeedMenu((v) => !v); setShowSleepMenu(false); }}
              className="text-xs font-semibold tabular-nums px-1.5 py-1 rounded-md transition-colors"
              style={{
                color: playbackRate !== 1 ? '#a78bfa' : '#94a3b8',
                backgroundColor: showSpeedMenu ? 'rgba(124,58,237,0.15)' : 'transparent',
              }}
              aria-label="Playback speed"
            >
              {playbackRate}×
            </button>

            {showSpeedMenu && (
              <div
                className="absolute bottom-full right-0 mb-2 rounded-xl overflow-hidden shadow-xl"
                style={{
                  backgroundColor: 'rgb(15,23,42)',
                  border: '1px solid rgb(51,65,85)',
                  minWidth: '90px',
                }}
              >
                {RATES.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setRate(r); setShowSpeedMenu(false); }}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors"
                    style={{
                      color: r === playbackRate ? '#a78bfa' : '#e2e8f0',
                      backgroundColor: r === playbackRate ? 'rgba(124,58,237,0.12)' : 'transparent',
                      fontWeight: r === playbackRate ? 600 : 400,
                    }}
                  >
                    <span>{r}×</span>
                    {r === playbackRate && <span style={{ color: '#a78bfa' }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sleep timer */}
          <div className="relative" ref={sleepMenuRef}>
            <button
              onClick={() => { setShowSleepMenu((v) => !v); setShowSpeedMenu(false); }}
              className="flex items-center gap-1 px-1.5 py-1 rounded-md text-xs transition-colors"
              style={{
                color: sleepTimer ? '#a78bfa' : '#94a3b8',
                backgroundColor: showSleepMenu ? 'rgba(124,58,237,0.15)' : 'transparent',
              }}
              aria-label="Sleep timer"
            >
              <Moon size={15} />
              {sleepCountdown && (
                <span className="tabular-nums font-semibold" style={{ color: '#a78bfa' }}>
                  {sleepCountdown}
                </span>
              )}
              {sleepTimer?.endsAt === 'episode' && !sleepCountdown && (
                <span className="text-xs" style={{ color: '#a78bfa' }}>ep</span>
              )}
            </button>

            {showSleepMenu && (
              <div
                className="absolute bottom-full right-0 mb-2 rounded-xl overflow-hidden shadow-xl"
                style={{
                  backgroundColor: 'rgb(15,23,42)',
                  border: '1px solid rgb(51,65,85)',
                  minWidth: '160px',
                }}
              >
                <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                  Sleep Timer
                </p>
                {SLEEP_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => startSleepTimer(opt.minutes, opt.label)}
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                    style={{
                      color: sleepTimer?.label === opt.label ? '#a78bfa' : '#e2e8f0',
                      backgroundColor:
                        sleepTimer?.label === opt.label ? 'rgba(124,58,237,0.12)' : 'transparent',
                      fontWeight: sleepTimer?.label === opt.label ? 600 : 400,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                {sleepTimer && (
                  <>
                    <div style={{ height: '1px', backgroundColor: 'rgb(51,65,85)', margin: '4px 0' }} />
                    <button
                      onClick={cancelSleepTimer}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
                      style={{ color: '#f87171' }}
                    >
                      <X size={13} />
                      Cancel timer
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
