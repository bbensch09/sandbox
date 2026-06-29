'use client';

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';

export interface Episode {
  id: string;
  title: string;
  source_url?: string;
  audio_url?: string;
  duration_seconds?: number;
  word_count?: number;
  status: string;
  error_message?: string;
  listen_position_seconds: number;
  created_at: string;
}

interface PlayerState {
  episode: Episode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
}

interface PlayerContextValue extends PlayerState {
  play: (episode: Episode) => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  setRate: (rate: number) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<PlayerState>({
    episode: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
  });

  const savePosition = useCallback((episodeId: string, position: number) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch(`/api/episodes/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listen_position_seconds: position }),
      }).catch(() => {});
    }, 5000);
  }, []);

  const play = useCallback(
    (episode: Episode) => {
      setState((s) => ({ ...s, episode, isPlaying: true }));
      // Audio src is set via useEffect below
    },
    [],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setState((s) => ({ ...s, isPlaying: true }));
    } else {
      audio.pause();
      setState((s) => ({ ...s, isPlaying: false }));
    }
  }, []);

  const seek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || 0));
    },
    [],
  );

  const skip = useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      seek(audio.currentTime + delta);
    },
    [seek],
  );

  const setRate = useCallback((rate: number) => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
    setState((s) => ({ ...s, playbackRate: rate }));
  }, []);

  // Mount audio element once
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    audio.addEventListener('timeupdate', () => {
      setState((s) => {
        if (s.episode) savePosition(s.episode.id, audio.currentTime);
        return { ...s, currentTime: audio.currentTime };
      });
    });
    audio.addEventListener('durationchange', () => {
      setState((s) => ({ ...s, duration: audio.duration }));
    });
    audio.addEventListener('ended', () => {
      setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }));
    });
    audio.addEventListener('play', () =>
      setState((s) => ({ ...s, isPlaying: true })),
    );
    audio.addEventListener('pause', () =>
      setState((s) => ({ ...s, isPlaying: false })),
    );

    return () => {
      audio.pause();
      clearTimeout(saveTimerRef.current ?? undefined);
    };
  }, [savePosition]);

  // When episode changes, load it
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.episode?.audio_url) return;

    audio.src = state.episode.audio_url;
    audio.currentTime = state.episode.listen_position_seconds || 0;
    audio.playbackRate = state.playbackRate;
    audio.play().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.episode?.id]);

  return (
    <PlayerContext.Provider
      value={{ ...state, play, togglePlay, seek, skip, setRate, audioRef }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}
