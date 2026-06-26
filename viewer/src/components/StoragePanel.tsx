import { useMemo, useState } from "react";
import type { CookieRecord, StorageSnapshot } from "@shared/format";
import { CollapsibleValue, JsonTree } from "./JsonTree";

type Mode = "start" | "end" | "diff";

interface Props {
  start: StorageSnapshot | null;
  end: StorageSnapshot | null;
}

type RowState = "same" | "added" | "removed" | "changed";

interface KvRow {
  key: string;
  startVal?: string;
  endVal?: string;
  state: RowState;
}

function diffKv(
  a: Record<string, string>,
  b: Record<string, string>,
): KvRow[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const rows: KvRow[] = [];
  for (const key of [...keys].sort()) {
    const inA = key in a;
    const inB = key in b;
    let state: RowState = "same";
    if (inA && !inB) state = "removed";
    else if (!inA && inB) state = "added";
    else if (a[key] !== b[key]) state = "changed";
    rows.push({ key, startVal: a[key], endVal: b[key], state });
  }
  return rows;
}

function KvBlock({
  title,
  start,
  end,
  mode,
}: {
  title: string;
  start: Record<string, string>;
  end: Record<string, string>;
  mode: Mode;
}) {
  const rows = useMemo(() => diffKv(start, end), [start, end]);
  const visible =
    mode === "diff" ? rows.filter((r) => r.state !== "same") : rows;

  if (mode !== "diff") {
    const src = mode === "start" ? start : end;
    const keys = Object.keys(src).sort();
    return (
      <section className="store-block">
        <h4>{title} <span className="muted">({keys.length})</span></h4>
        {keys.length === 0 ? (
          <div className="empty small">empty</div>
        ) : (
          <table className="kv">
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <td className="kv-key">{k}</td>
                  <td className="kv-val">
                    <CollapsibleValue value={src[k]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }

  return (
    <section className="store-block">
      <h4>{title} <span className="muted">({visible.length} changed)</span></h4>
      {visible.length === 0 ? (
        <div className="empty small">no changes</div>
      ) : (
        <table className="kv">
          <tbody>
            {visible.map((r) => (
              <tr key={r.key} className={`diff-${r.state}`}>
                <td className="kv-key">{r.key}</td>
                <td className="kv-val">
                  {r.state === "changed" ? (
                    <div className="diff-change">
                      <div className="diff-old">
                        <CollapsibleValue value={r.startVal ?? ""} />
                      </div>
                      <div className="diff-new">
                        <CollapsibleValue value={r.endVal ?? ""} />
                      </div>
                    </div>
                  ) : r.state === "removed" ? (
                    <div className="diff-old">
                      <CollapsibleValue value={r.startVal ?? ""} />
                    </div>
                  ) : (
                    <div className="diff-new">
                      <CollapsibleValue value={r.endVal ?? ""} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function CookieBlock({ cookies }: { cookies: CookieRecord[] }) {
  return (
    <section className="store-block">
      <h4>cookies <span className="muted">({cookies.length})</span></h4>
      {cookies.length === 0 ? (
        <div className="empty small">none</div>
      ) : (
        <table className="kv">
          <tbody>
            {cookies.map((c, i) => (
              <tr key={i}>
                <td className="kv-key">{c.name}</td>
                <td className="kv-val">
                  <CollapsibleValue value={c.value} />
                  <span className="cookie-meta">
                    {c.domain}
                    {c.httpOnly ? " · HttpOnly" : ""}
                    {c.secure ? " · Secure" : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function StoragePanel({ start, end }: Props) {
  const [mode, setMode] = useState<Mode>("end");
  const snap = mode === "start" ? start : end;
  const empty: Record<string, string> = {};

  if (!start && !end) {
    return <div className="panel"><div className="empty">No storage captured.</div></div>;
  }

  return (
    <div className="panel storage-panel">
      <div className="panel-toolbar">
        {(["start", "end", "diff"] as Mode[]).map((m) => (
          <button
            key={m}
            className={`chip ${mode === m ? "on" : "off"}`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
        {snap?.origin && <span className="muted small">{snap.origin}</span>}
      </div>
      <div className="panel-body scroll">
        <KvBlock
          title="localStorage"
          start={start?.localStorage ?? empty}
          end={end?.localStorage ?? empty}
          mode={mode}
        />
        <KvBlock
          title="sessionStorage"
          start={start?.sessionStorage ?? empty}
          end={end?.sessionStorage ?? empty}
          mode={mode}
        />
        {mode !== "diff" && <CookieBlock cookies={snap?.cookies ?? []} />}
        {mode !== "diff" && (snap?.indexedDB || snap?.indexedDBError) && (
          <section className="store-block">
            <h4>indexedDB</h4>
            {snap?.indexedDBError ? (
              <div className="empty small">{snap.indexedDBError}</div>
            ) : (
              <JsonTree value={snap?.indexedDB ?? {}} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
