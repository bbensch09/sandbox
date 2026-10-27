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
  updated_at?: string;
  content?: string;
  original_content?: string | null;
  removed_content?: { text: string; reason: string }[] | null;
  review_notes?: string[] | null;
  unrelated_share?: number | null;
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
  /** Where playback of this episode would resume, in seconds. */
  resumePosition: (episode: Episode) => number;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export const SKIP_SECONDS = 15;

/** Server writes while playing; the phone's own copy is written far more often. */
const SERVER_SAVE_INTERVAL_MS = 15_000;
const LOCAL_SAVE_INTERVAL_MS = 2_000;
/** Stopping this close to the end counts as finished — start over next time. */
const FINISHED_MARGIN_S = 10;

const POSITIONS_KEY = 'articlecast:positions';
type SavedPosition = { t: number; at: number };

function readPositions(): Record<string, SavedPosition> {
  try {
    return JSON.parse(localStorage.getItem(POSITIONS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writePosition(id: string, t: number) {
  try {
    const all = readPositions();
    all[id] = { t, at: Date.now() };
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(all));
  } catch {
    // Private mode / storage full — the server copy still exists.
  }
}

function saveToServer(id: string, t: number) {
  // keepalive lets the request finish when the page is being closed.
  fetch(`/api/episodes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listen_position_seconds: t }),
    keepalive: true,
  }).catch(() => {});
}

/** Saved position, preferring whichever copy is newer: this phone's, or the
 *  server's (which may have been written from another device). */
function storedPosition(episode: Episode): number {
  const local = readPositions()[episode.id];
  const serverAt = episode.updated_at ? Date.parse(episode.updated_at) : 0;
  if (local && local.at >= serverAt) return local.t;
  return episode.listen_position_seconds || 0;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Set by the "End of episode" sleep timer so the queue doesn't auto-advance.
  const stopAfterEpisodeRef = useRef(false);
  // Mirrors of state for event handlers registered once at mount.
  const episodeRef = useRef<Episode | null>(null);
  const queueRef = useRef<Episode[]>([]);
  const lastSaveRef = useRef({ local: 0, server: 0 });
  // False while a new file loads: its currentTime (0) isn't a real position yet,
  // and the `pause` fired by swapping src would otherwise save 0 over it.
  const positionReadyRef = useRef(false);

  const [state, setState] = useState<PlayerState>({
    episode: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    queue: [],
  });

  useEffect(() => {
    episodeRef.current = state.episode;
    queueRef.current = state.queue;
  }, [state.episode, state.queue]);

  /** Save where the current episode is, now. */
  const flushPosition = useCallback(() => {
    const audio = audioRef.current;
    const ep = episodeRef.current;
    if (!audio || !ep || !positionReadyRef.current) return;
    const finished = audio.duration > 0 && audio.currentTime >= audio.duration - FINISHED_MARGIN_S;
    const t = finished ? 0 : audio.currentTime;
    writePosition(ep.id, t);
    saveToServer(ep.id, t);
    lastSaveRef.current = { local: Date.now(), server: Date.now() };
  }, []);

  const resumePosition = useCallback((episode: Episode) => {
    if (episodeRef.current?.id === episode.id && audioRef.current && positionReadyRef.current) {
      return audioRef.current.currentTime;
    }
    return storedPosition(episode);
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
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
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
      setState((s) => ({ ...s, currentTime: audio.currentTime }));

      const ep = episodeRef.current;
      if (!ep || audio.paused || !positionReadyRef.current) return;
      const now = Date.now();
      if (now - lastSaveRef.current.local > LOCAL_SAVE_INTERVAL_MS) {
        writePosition(ep.id, audio.currentTime);
        lastSaveRef.current.local = now;
      }
      if (now - lastSaveRef.current.server > SERVER_SAVE_INTERVAL_MS) {
        saveToServer(ep.id, audio.currentTime);
        lastSaveRef.current.server = now;
      }
    });
    audio.addEventListener('durationchange', () => {
      setState((s) => ({ ...s, duration: audio.duration }));
    });
    audio.addEventListener('ended', () => {
      flushPosition(); // records 0 — a finished episode starts over next time
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
    audio.addEventListener('pause', () => {
      setState((s) => ({ ...s, isPlaying: false }));
      if (!audio.ended) flushPosition();
    });

    // The app can be swiped away at any moment — save on the way out.
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushPosition();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flushPosition);

    return () => {
      audio.pause();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flushPosition);
    };
  }, [flushPosition]);

  // When episode changes, save where the old one was, then load the new one
  useEffect(() => {
    const audio = audioRef.current;
    const episode = state.episode;
    if (!audio || !episode?.audio_url) return;

    // Not resumePosition(): by now the audio element still holds the previous
    // episode's time, which must not leak into this one.
    const start = storedPosition(episode);
    positionReadyRef.current = false;
    audio.src = episode.audio_url;
    audio.playbackRate = state.playbackRate;
    // Setting currentTime before metadata loads is ignored on iOS Safari.
    const applyStart = () => {
      if (start > 0 && !(audio.duration > 0 && start >= audio.duration - FINISHED_MARGIN_S)) {
        audio.currentTime = start;
      }
      positionReadyRef.current = true;
      lastSaveRef.current = { local: Date.now(), server: Date.now() };
    };
    audio.addEventListener('loadedmetadata', applyStart, { once: true });
    audio.play().catch(() => {});
    return () => {
      audio.removeEventListener('loadedmetadata', applyStart);
      // Runs before the next episode loads (and still points at this one).
      flushPosition();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.episode?.id]);

  // Lock screen, Control Center, CarPlay and headphone buttons
  useEffect(() => {
    if (!('mediaSession' in navigator) || !state.episode) return;
    const ep = state.episode;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ep.title,
      artist: ep.source_url ? new URL(ep.source_url).hostname.replace('www.', '') : 'ArticleCast',
      album: 'ArticleCast',
      artwork: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ['play', () => { audioRef.current?.play().catch(() => {}); }],
      ['pause', () => audioRef.current?.pause()],
      ['seekbackward', (d) => skip(-(d.seekOffset ?? SKIP_SECONDS))],
      ['seekforward', (d) => skip(d.seekOffset ?? SKIP_SECONDS)],
      ['seekto', (d) => { if (d.seekTime != null) seek(d.seekTime); }],
      // Without a queue, leave "next" unset so iOS shows the ±15s buttons.
      ['nexttrack', state.queue.length > 0 ? () => skipToNext() : null],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Action not supported on this browser
      }
    }
  }, [state.episode, state.queue.length, skip, seek, skipToNext]);

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
        resumePosition,
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
