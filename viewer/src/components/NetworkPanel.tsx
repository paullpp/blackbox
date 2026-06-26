import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import type { NetworkEntry, ParsedRecording } from "@shared/format";
import { countRevealed } from "../lib/search";
import { fmtDuration, fmtTime, shortUrl, statusClass } from "../lib/format";
import { useSize } from "../hooks/useSize";
import { NetworkDetail } from "./NetworkDetail";
import { ArrowDownIcon } from "./icons";

const ROW_HEIGHT = 30;

interface Props {
  entries: NetworkEntry[];
  playheadMs: number;
  playing: boolean;
  onSeek: (ms: number) => void;
  readBody: ParsedRecording["readBody"];
}

export function NetworkPanel({
  entries,
  playheadMs,
  playing,
  onSeek,
  readBody,
}: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<NetworkEntry | null>(null);
  const [follow, setFollow] = useState(true);
  const { ref, width, height } = useSize<HTMLDivElement>();
  const listRef = useRef<FixedSizeList>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? entries.filter((e) => e.request.url.toLowerCase().includes(q)) : entries;
  }, [entries, query]);

  // Reveal entries whose request has started by the playhead.
  const startSorted = filtered; // already sorted by offsetMs (== startOffsetMs)
  const revealed = useMemo(
    () => countRevealed(startSorted, playheadMs),
    [startSorted, playheadMs],
  );
  const activeIdx = revealed - 1;

  // While the mouse is over the list, the user is trying to interact — never
  // auto-scroll out from under them.
  const hoverRef = useRef(false);

  useEffect(() => {
    if (playing && follow && !hoverRef.current && activeIdx >= 0) {
      listRef.current?.scrollToItem(activeIdx, "smart");
    }
  }, [playing, follow, activeIdx]);

  // Disengage auto-follow as soon as the user scrolls by hand; react-window
  // sets scrollUpdateWasRequested=true for our own scrollToItem calls.
  const onScroll = useCallback(
    ({ scrollUpdateWasRequested }: { scrollUpdateWasRequested: boolean }) => {
      if (!scrollUpdateWasRequested) setFollow(false);
    },
    [],
  );

  const Row = ({ index, style }: ListChildComponentProps) => {
    const e = filtered[index];
    const future = index >= revealed;
    const status = e.response?.status ?? 0;
    const inflight = playheadMs >= e.timing.startOffsetMs &&
      (e.timing.endOffsetMs == null || playheadMs < e.timing.endOffsetMs);
    return (
      <div
        className={`net-row ${future ? "future" : ""} ${
          selected?.requestId === e.requestId ? "selected" : ""
        }`}
        style={style}
        onMouseDown={() => setSelected(e)}
      >
        <span className="net-time">{fmtTime(e.timing.startOffsetMs)}</span>
        <span className="net-method">{e.request.method}</span>
        <span className={`net-status ${e.status === "failed" ? "net-fail" : statusClass(status)}`}>
          {e.status === "failed" ? "ERR" : inflight ? "…" : status || "—"}
        </span>
        <span className="net-name" title={e.request.url}>
          {shortUrl(e.request.url)}
        </span>
        <span className="net-dur">{fmtDuration(e.timing.durationMs)}</span>
      </div>
    );
  };

  return (
    <div className="panel network-panel">
      <div className="panel-toolbar">
        <input
          className="search wide"
          placeholder="filter by url…"
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
        <span className="muted small">{revealed}/{filtered.length} sent</span>
      </div>
      <div className="net-head">
        <span className="net-time">time</span>
        <span className="net-method">method</span>
        <span className="net-status">status</span>
        <span className="net-name">name</span>
        <span className="net-dur">dur</span>
      </div>
      <div
        className="panel-body"
        ref={ref}
        onMouseEnter={() => (hoverRef.current = true)}
        onMouseLeave={() => (hoverRef.current = false)}
      >
        {filtered.length === 0 ? (
          <div className="empty">No network requests.</div>
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
      {selected && (
        <NetworkDetail
          entry={selected}
          readBody={readBody}
          onClose={() => setSelected(null)}
          onSeek={onSeek}
        />
      )}
    </div>
  );
}
