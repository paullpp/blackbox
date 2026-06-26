import type { Transport as TransportApi } from "../hooks/usePlayhead";
import { fmtTime } from "../lib/format";
import { Timeline, type TimelineMarker } from "./Timeline";
import { ForwardIcon, PauseIcon, PlayIcon, RewindIcon } from "./icons";

const RATES = [0.25, 0.5, 1, 1.5, 2, 4];

interface Props {
  transport: TransportApi;
  markers: TimelineMarker[];
}

export function Transport({ transport, markers }: Props) {
  const { playheadMs, durationMs, playing, rate } = transport;
  return (
    <div className="transport">
      <Timeline
        durationMs={durationMs}
        playheadMs={playheadMs}
        markers={markers}
        onSeek={transport.seek}
      />
      <div className="transport-controls">
        <button
          className="ctrl"
          onClick={() => transport.stepMs(-1000)}
          title="Back 1s"
          aria-label="Back 1 second"
        >
          <RewindIcon size={15} />
        </button>
        <button
          className="ctrl play"
          onClick={transport.toggle}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        </button>
        <button
          className="ctrl"
          onClick={() => transport.stepMs(1000)}
          title="Forward 1s"
          aria-label="Forward 1 second"
        >
          <ForwardIcon size={15} />
        </button>
        <span className="time-readout">
          {fmtTime(playheadMs)} <span className="muted">/ {fmtTime(durationMs)}</span>
        </span>
        <span className="spacer" />
        <label className="rate">
          speed
          <select
            value={rate}
            onChange={(e) => transport.setRate(Number(e.target.value))}
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
