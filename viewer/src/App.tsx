import { useEffect, useMemo, useRef, useState } from "react";
import type { ParsedRecording } from "@shared/format";
import { disposeRecording, loadRecording } from "./lib/loadRecording";
import { fmtTime } from "./lib/format";
import { usePlayhead } from "./hooks/usePlayhead";
import { Dropzone } from "./components/Dropzone";
import { VideoPlayer } from "./components/VideoPlayer";
import { Transport } from "./components/Transport";
import { ConsolePanel } from "./components/ConsolePanel";
import { NetworkPanel } from "./components/NetworkPanel";
import { StoragePanel } from "./components/StoragePanel";
import type { TimelineMarker } from "./components/Timeline";

type Tab = "console" | "network" | "storage";

export default function App() {
  const [rec, setRec] = useState<ParsedRecording | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("console");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => () => disposeRecording(rec), [rec]);

  const durationMs = rec?.manifest.durationMs ?? 0;
  const hasVideo = Boolean(rec?.videoUrl);
  const transport = usePlayhead(videoRef, durationMs, hasVideo);

  const markers = useMemo<TimelineMarker[]>(() => {
    if (!rec) return [];
    const m: TimelineMarker[] = [];
    for (const e of rec.console)
      if (e.level === "error") m.push({ offsetMs: e.offsetMs, kind: "error" });
    for (const n of rec.network)
      if (n.status === "failed")
        m.push({ offsetMs: n.timing.startOffsetMs, kind: "netfail" });
    return m;
  }, [rec]);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    try {
      const parsed = await loadRecording(file);
      setRec((prev) => {
        disposeRecording(prev);
        return parsed;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Keyboard: space = play/pause, arrows = step.
  useEffect(() => {
    if (!rec) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        transport.toggle();
      } else if (e.code === "ArrowLeft") {
        transport.stepMs(e.shiftKey ? -5000 : -1000);
      } else if (e.code === "ArrowRight") {
        transport.stepMs(e.shiftKey ? 5000 : 1000);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rec, transport]);

  if (!rec) {
    return <Dropzone onFile={handleFile} error={error} loading={loading} />;
  }

  const { manifest } = rec;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <strong>Blackbox</strong>
          <span className="muted">{manifest.page.title || manifest.page.url}</span>
        </div>
        <div className="app-meta muted">
          {new Date(manifest.recordingStartEpochMs).toLocaleString()} ·{" "}
          {fmtTime(manifest.durationMs)} · {manifest.counts.console} logs ·{" "}
          {manifest.counts.network} requests
        </div>
        <button className="ghost" onClick={() => setRec(null)}>
          Load another
        </button>
      </header>

      <div className="app-main">
        <section className="stage">
          <div className="video-wrap">
            <VideoPlayer
              videoRef={videoRef}
              src={rec.videoUrl}
              onToggle={transport.toggle}
            />
          </div>
          <Transport transport={transport} markers={markers} />
          <div className="page-url muted" title={manifest.page.url}>
            {manifest.page.url}
          </div>
        </section>

        <section className="side">
          <div className="tabs">
            {(["console", "network", "storage"] as Tab[]).map((t) => (
              <button
                key={t}
                className={`tab ${tab === t ? "on" : ""}`}
                onClick={() => setTab(t)}
              >
                {t}
                {t === "console" && ` (${rec.console.length})`}
                {t === "network" && ` (${rec.network.length})`}
              </button>
            ))}
          </div>
          <div className="tab-content">
            {tab === "console" && (
              <ConsolePanel
                events={rec.console}
                playheadMs={transport.playheadMs}
                playing={transport.playing}
                onSeek={transport.seek}
              />
            )}
            {tab === "network" && (
              <NetworkPanel
                entries={rec.network}
                playheadMs={transport.playheadMs}
                playing={transport.playing}
                onSeek={transport.seek}
                readBody={rec.readBody}
              />
            )}
            {tab === "storage" && (
              <StoragePanel start={rec.storageStart} end={rec.storageEnd} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
