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
  character_count?: number;
  is_interview?: boolean;
  speaker_count?: number;
  source_type?: string;
  auto_convert?: boolean;
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
  queue: Episode[]; // "Up Next" — plays in order after the current episode ends
}

interface PlayerContextValue extends PlayerState {
  play: (episode: Episode) => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  setRate: (rate: number) => void;
  playNext: (episode: Episode) => void;
  addToQueue: (episode: Episode) => void;
  removeFromQueue: (episodeId: string) => void;
  skipToNext: () => void;
  setStopAfterEpisode: (stop: boolean) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set by the "End of episode" sleep timer so the queue doesn't auto-advance.
  const stopAfterEpisodeRef = useRef(false);

  const [state, setState] = useState<PlayerState>({
    episode: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    queue: [],
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
      setState((s) => ({
        ...s,
        episode,
        isPlaying: true,
        queue: s.queue.filter((e) => e.id !== episode.id),
      }));
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

  // Queue helpers. With nothing loaded there is nothing to queue behind, so
  // both start playback straight away (matches the iOS Podcasts app).
  const enqueue = useCallback((episode: Episode, atFront: boolean) => {
    setState((s) => {
      if (!s.episode) return { ...s, episode, isPlaying: true };
      if (s.episode.id === episode.id) return s;
      const rest = s.queue.filter((e) => e.id !== episode.id);
      return { ...s, queue: atFront ? [episode, ...rest] : [...rest, episode] };
    });
  }, []);

  const playNext = useCallback((episode: Episode) => enqueue(episode, true), [enqueue]);
  const addToQueue = useCallback((episode: Episode) => enqueue(episode, false), [enqueue]);

  const removeFromQueue = useCallback((episodeId: string) => {
    setState((s) => ({ ...s, queue: s.queue.filter((e) => e.id !== episodeId) }));
  }, []);

  const skipToNext = useCallback(() => {
    setState((s) => {
      if (s.queue.length === 0) return s;
      const [next, ...rest] = s.queue;
      return { ...s, episode: next, queue: rest, isPlaying: true, currentTime: 0 };
    });
  }, []);

  const setStopAfterEpisode = useCallback((stop: boolean) => {
    stopAfterEpisodeRef.current = stop;
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
      setState((s) => {
        // Advance to the next queued episode; the load effect below starts it.
        if (s.queue.length > 0 && !stopAfterEpisodeRef.current) {
          const [next, ...rest] = s.queue;
          return { ...s, episode: next, queue: rest, isPlaying: true, currentTime: 0 };
        }
        return { ...s, isPlaying: false, currentTime: 0 };
      });
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
      value={{
        ...state,
        play,
        togglePlay,
        seek,
        skip,
        setRate,
        playNext,
        addToQueue,
        removeFromQueue,
        skipToNext,
        setStopAfterEpisode,
        audioRef,
      }}
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
