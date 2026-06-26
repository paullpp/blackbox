import { useCallback, useRef } from "react";

export interface TimelineMarker {
  offsetMs: number;
  kind: "error" | "netfail";
}

interface Props {
  durationMs: number;
  playheadMs: number;
  markers: TimelineMarker[];
  onSeek: (ms: number) => void;
}

/** Seek bar with error / network-failure density markers. */
export function Timeline({ durationMs, playheadMs, markers, onSeek }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar || durationMs <= 0) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(ratio * durationMs);
    },
    [durationMs, onSeek],
  );

  const pct = durationMs > 0 ? (playheadMs / durationMs) * 100 : 0;

  return (
    <div
      className="timeline"
      ref={barRef}
      onMouseDown={(e) => {
        dragging.current = true;
        seekFromEvent(e.clientX);
      }}
      onMouseMove={(e) => dragging.current && seekFromEvent(e.clientX)}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
    >
      <div className="timeline-track" />
      <div className="timeline-progress" style={{ width: `${pct}%` }} />
      {markers.map((m, i) => (
        <div
          key={i}
          className={`timeline-marker ${m.kind}`}
          style={{
            left: `${durationMs > 0 ? (m.offsetMs / durationMs) * 100 : 0}%`,
          }}
          title={m.kind === "error" ? "Console error" : "Network failure"}
        />
      ))}
      <div className="timeline-playhead" style={{ left: `${pct}%` }} />
    </div>
  );
}
