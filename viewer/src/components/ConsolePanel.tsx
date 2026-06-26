import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import type { ConsoleEvent, ConsoleLevel } from "@shared/format";
import { countRevealed } from "../lib/search";
import { fmtTime } from "../lib/format";
import { useSize } from "../hooks/useSize";
import { ArrowDownIcon } from "./icons";

const ROW_HEIGHT = 30;
const LEVELS: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];

interface Props {
  events: ConsoleEvent[];
  playheadMs: number;
  playing: boolean;
  onSeek: (ms: number) => void;
}

export function ConsolePanel({ events, playheadMs, playing, onSeek }: Props) {
  const [enabled, setEnabled] = useState<Record<ConsoleLevel, boolean>>({
    log: true,
    info: true,
    warn: true,
    error: true,
    debug: true,
  });
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const { ref, width, height } = useSize<HTMLDivElement>();
  const listRef = useRef<FixedSizeList>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(
      (e) => enabled[e.level] && (!q || e.text.toLowerCase().includes(q)),
    );
  }, [events, enabled, query]);

  // How many filtered rows are at/before the playhead.
  const revealed = useMemo(
    () => countRevealed(filtered, playheadMs),
    [filtered, playheadMs],
  );
  const activeIdx = revealed - 1;

  // Never auto-scroll while the mouse is over the list (the user is interacting).
  const hoverRef = useRef(false);

  // Follow the playhead while playing, unless the user has scrolled away.
  useEffect(() => {
    if (playing && follow && !hoverRef.current && activeIdx >= 0) {
      listRef.current?.scrollToItem(activeIdx, "smart");
    }
  }, [playing, follow, activeIdx]);

  const onScroll = useCallback(
    ({ scrollUpdateWasRequested }: { scrollUpdateWasRequested: boolean }) => {
      if (!scrollUpdateWasRequested) setFollow(false);
    },
    [],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.level] = (c[e.level] ?? 0) + 1;
    return c;
  }, [events]);

  const Row = ({ index, style }: ListChildComponentProps) => {
    const e = filtered[index];
    const future = index >= revealed;
    const active = index === activeIdx;
    return (
      <div
        className={`log-row ${e.level} ${future ? "future" : ""} ${
          active ? "active" : ""
        }`}
        style={style}
        onMouseDown={() => onSeek(e.offsetMs)}
        title={e.source === "exception" ? "Uncaught exception" : e.source}
      >
        <span className="log-time">{fmtTime(e.offsetMs)}</span>
        <span className={`log-badge ${e.level}`}>{e.level}</span>
        <span className="log-text">{e.text || " "}</span>
      </div>
    );
  };

  return (
    <div className="panel console-panel">
      <div className="panel-toolbar">
        {LEVELS.map((lv) => (
          <button
            key={lv}
            className={`chip ${lv} ${enabled[lv] ? "on" : "off"}`}
            onClick={() => setEnabled((s) => ({ ...s, [lv]: !s[lv] }))}
          >
            {lv} {counts[lv] ? `(${counts[lv]})` : ""}
          </button>
        ))}
        <input
          className="search"
          placeholder="filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className={`chip ${follow ? "on" : "off"}`}
          title="Auto-scroll to the playhead while playing"
          onClick={() => {
            setFollow(true);
            if (activeIdx >= 0) listRef.current?.scrollToItem(activeIdx, "smart");
          }}
        >
          <ArrowDownIcon size={12} /> follow
        </button>
      </div>
      <div
        className="panel-body"
        ref={ref}
        onMouseEnter={() => (hoverRef.current = true)}
        onMouseLeave={() => (hoverRef.current = false)}
      >
        {filtered.length === 0 ? (
          <div className="empty">No console output.</div>
        ) : (
          <FixedSizeList
            ref={listRef}
            height={height || 300}
            width={width || 300}
            itemCount={filtered.length}
            itemSize={ROW_HEIGHT}
            onScroll={onScroll}
          >
            {Row}
          </FixedSizeList>
        )}
      </div>
    </div>
  );
}
