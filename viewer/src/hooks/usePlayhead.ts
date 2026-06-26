import { useCallback, useEffect, useRef, useState } from "react";

export interface Transport {
  playheadMs: number;
  durationMs: number;
  playing: boolean;
  rate: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (ms: number) => void;
  stepMs: (delta: number) => void;
  setRate: (r: number) => void;
}

/**
 * Master clock for the replay. When a <video> is present it IS the clock and
 * everything reads off video.currentTime; otherwise a synthetic timer advances
 * the playhead across the manifest duration so logs/network still replay.
 */
export function usePlayhead(
  videoRef: React.RefObject<HTMLVideoElement>,
  durationMs: number,
  hasVideo: boolean,
): Transport {
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);

  const rafRef = useRef<number>();
  const lastTickRef = useRef<number>();
  const playheadRef = useRef(0);
  const playingRef = useRef(false);
  const rateRef = useRef(1);

  const setPlayhead = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(ms, durationMs));
      playheadRef.current = clamped;
      setPlayheadMs(clamped);
    },
    [durationMs],
  );

  // ---- video-driven clock ----
  useEffect(() => {
    const v = videoRef.current;
    if (!hasVideo || !v) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onSeek = () => setPlayhead(v.currentTime * 1000);
    const onTime = () => setPlayhead(v.currentTime * 1000);
    const onEnded = () => setPlaying(false);

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeking", onSeek);
    v.addEventListener("seeked", onSeek);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeking", onSeek);
      v.removeEventListener("seeked", onSeek);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onEnded);
    };
  }, [hasVideo, videoRef, setPlayhead]);

  // ---- rAF loop: smooth playhead (video) or synthetic advance (no video) ----
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  useEffect(() => {
    const loop = (ts: number) => {
      const v = videoRef.current;
      if (hasVideo && v) {
        if (!v.paused) setPlayhead(v.currentTime * 1000);
      } else if (playingRef.current) {
        const last = lastTickRef.current ?? ts;
        const dt = (ts - last) * rateRef.current;
        const next = playheadRef.current + dt;
        if (next >= durationMs) {
          setPlayhead(durationMs);
          setPlaying(false);
        } else {
          setPlayhead(next);
        }
      }
      lastTickRef.current = ts;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = undefined;
    };
  }, [hasVideo, videoRef, durationMs, setPlayhead]);

  // ---- controls ----
  const play = useCallback(() => {
    const v = videoRef.current;
    if (hasVideo && v) void v.play();
    else {
      lastTickRef.current = undefined;
      if (playheadRef.current >= durationMs) setPlayhead(0);
      setPlaying(true);
    }
  }, [hasVideo, videoRef, durationMs, setPlayhead]);

  const pause = useCallback(() => {
    const v = videoRef.current;
    if (hasVideo && v) v.pause();
    else setPlaying(false);
  }, [hasVideo, videoRef]);

  const toggle = useCallback(() => {
    (playingRef.current ? pause : play)();
  }, [play, pause]);

  const seek = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(ms, durationMs));
      const v = videoRef.current;
      if (hasVideo && v) v.currentTime = clamped / 1000;
      setPlayhead(clamped);
    },
    [hasVideo, videoRef, durationMs, setPlayhead],
  );

  const stepMs = useCallback(
    (delta: number) => seek(playheadRef.current + delta),
    [seek],
  );

  const setRate = useCallback(
    (r: number) => {
      const v = videoRef.current;
      if (hasVideo && v) v.playbackRate = r;
      rateRef.current = r;
      setRateState(r);
    },
    [hasVideo, videoRef],
  );

  return {
    playheadMs,
    durationMs,
    playing,
    rate,
    play,
    pause,
    toggle,
    seek,
    stepMs,
    setRate,
  };
}
