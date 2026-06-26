import { useEffect } from "react";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  src: string | null;
  onToggle: () => void;
}

/**
 * Renders the recording video. MediaRecorder webm files often report
 * `duration === Infinity` until the browser is forced to scan to the end, which
 * breaks seeking — so we apply the well-known "seek to the end once" fix on
 * loadedmetadata.
 */
export function VideoPlayer({ videoRef, src, onToggle }: Props) {
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;

    const fixDuration = () => {
      if (v.duration === Infinity || Number.isNaN(v.duration)) {
        const onSeeked = () => {
          v.currentTime = 0;
          v.removeEventListener("seeked", onSeeked);
        };
        v.addEventListener("seeked", onSeeked);
        // Seek far past the end; the browser clamps and computes real duration.
        v.currentTime = 1e7;
      }
    };
    v.addEventListener("loadedmetadata", fixDuration);
    return () => v.removeEventListener("loadedmetadata", fixDuration);
  }, [videoRef, src]);

  if (!src) {
    return (
      <div className="video-missing">
        No video track in this recording — replaying logs &amp; network on a
        timeline.
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={src}
      className="video-el"
      // Use our own transport; native controls would fight the sync engine.
      playsInline
      onClick={onToggle}
    />
  );
}
