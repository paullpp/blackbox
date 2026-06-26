import { useEffect, useState } from "react";
import type { BodyRef, NetworkEntry, ParsedRecording } from "@shared/format";
import { fmtBytes, fmtDuration } from "../lib/format";
import { CloseIcon, SeekIcon } from "./icons";
import { JsonOrText } from "./JsonTree";

type Tab = "general" | "request" | "response";

interface Props {
  entry: NetworkEntry;
  readBody: ParsedRecording["readBody"];
  onClose: () => void;
  onSeek: (ms: number) => void;
}

function HeaderTable({ headers }: { headers: Record<string, string> }) {
  const keys = Object.keys(headers);
  if (keys.length === 0) return <div className="empty small">No headers.</div>;
  return (
    <table className="kv">
      <tbody>
        {keys.map((k) => (
          <tr key={k}>
            <td className="kv-key">{k}</td>
            <td className="kv-val">{headers[k]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BodyView({
  body,
  readBody,
}: {
  body: BodyRef | null;
  readBody: ParsedRecording["readBody"];
}) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setText(null);
    if (body?.path && !body.truncated) {
      setLoading(true);
      readBody(body.path).then((r) => {
        if (alive) {
          setText(r.text);
          setLoading(false);
        }
      });
    }
    return () => {
      alive = false;
    };
  }, [body, readBody]);

  if (!body) return <div className="empty small">No body.</div>;
  if (body.truncated)
    return (
      <div className="empty small">
        Body omitted ({fmtBytes(body.size)} — exceeds capture cap).
      </div>
    );
  if (loading) return <div className="empty small">Loading…</div>;

  const isImage = /^image\//.test(body.mimeType);
  if (isImage) {
    return <div className="empty small">[{body.mimeType}, {fmtBytes(body.size)}]</div>;
  }
  return text ? <JsonOrText text={text} /> : <div className="empty small">—</div>;
}

export function NetworkDetail({ entry, readBody, onClose, onSeek }: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const res = entry.response;

  return (
    <div className="net-detail">
      <div className="net-detail-head">
        <div className="net-detail-tabs">
          {(["general", "request", "response"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`tab ${tab === t ? "on" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          className="net-seek"
          onClick={() => onSeek(entry.timing.startOffsetMs)}
          title="Seek playhead to this request"
        >
          <SeekIcon size={14} /> seek
        </button>
        <button className="net-close" onClick={onClose} aria-label="Close">
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="net-detail-body">
        {tab === "general" && (
          <table className="kv">
            <tbody>
              <tr><td className="kv-key">URL</td><td className="kv-val break">{entry.request.url}</td></tr>
              <tr><td className="kv-key">Method</td><td className="kv-val">{entry.request.method}</td></tr>
              <tr><td className="kv-key">Status</td><td className="kv-val">{res ? `${res.status} ${res.statusText}` : entry.status}</td></tr>
              <tr><td className="kv-key">Type</td><td className="kv-val">{entry.request.resourceType ?? "—"} / {res?.mimeType ?? "—"}</td></tr>
              <tr><td className="kv-key">Remote</td><td className="kv-val">{res?.remoteIPAddress ?? "—"}{res?.fromCache ? " (from cache)" : ""}</td></tr>
              <tr><td className="kv-key">Duration</td><td className="kv-val">{fmtDuration(entry.timing.durationMs)}</td></tr>
              {entry.errorText && (
                <tr><td className="kv-key">Error</td><td className="kv-val err">{entry.errorText}</td></tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "request" && (
          <>
            <h4>Request headers</h4>
            <HeaderTable headers={entry.request.headers} />
            <h4>Payload</h4>
            <BodyView body={entry.request.body} readBody={readBody} />
          </>
        )}

        {tab === "response" && (
          <>
            <h4>Response headers</h4>
            <HeaderTable headers={res?.headers ?? {}} />
            <h4>Body{res?.body ? ` (${fmtBytes(res.body.size)})` : ""}</h4>
            <BodyView body={res?.body ?? null} readBody={readBody} />
          </>
        )}
      </div>
    </div>
  );
}
