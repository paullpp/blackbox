import { useState } from "react";
import { ChevronIcon } from "./icons";

const STRING_PREVIEW = 140;
const TEXT_PREVIEW = 2000;

function tryParseJson(s: string): unknown | undefined {
  const t = s.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return typeof v === "object" && v !== null;
}

function entriesOf(v: Record<string, unknown> | unknown[]): [string, unknown][] {
  return Array.isArray(v)
    ? v.map((x, i) => [String(i), x] as [string, unknown])
    : Object.entries(v);
}

function summarize(v: Record<string, unknown> | unknown[]): string {
  if (Array.isArray(v)) return `[ … ] ${v.length} item${v.length === 1 ? "" : "s"}`;
  const n = Object.keys(v).length;
  return `{ … } ${n} key${n === 1 ? "" : "s"}`;
}

function StringValue({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  if (value.length <= STRING_PREVIEW) {
    return <span className="j-str">"{value}"</span>;
  }
  return (
    <span className="j-str">
      "{open ? value : value.slice(0, STRING_PREVIEW) + "…"}"
      <button
        className="j-more"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {open ? "less" : `more (${value.length})`}
      </button>
    </span>
  );
}

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="j-null">null</span>;
  if (value === undefined) return <span className="j-null">undefined</span>;
  switch (typeof value) {
    case "string":
      return <StringValue value={value} />;
    case "number":
      return <span className="j-num">{String(value)}</span>;
    case "boolean":
      return <span className="j-bool">{String(value)}</span>;
    default:
      return <span>{String(value)}</span>;
  }
}

function JsonNode({
  keyName,
  value,
  depth,
}: {
  keyName?: string;
  value: unknown;
  depth: number;
}) {
  // A string that is itself JSON: render the parsed structure (common in storage).
  let effective = value;
  let jsonString = false;
  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    if (parsed !== undefined && isContainer(parsed)) {
      effective = parsed;
      jsonString = true;
    }
  }

  if (!isContainer(effective)) {
    return (
      <div className="j-line j-leaf">
        {keyName != null && <span className="j-key">{keyName}:</span>}
        <Primitive value={effective} />
      </div>
    );
  }

  const entries = entriesOf(effective);
  const [open, setOpen] = useState(depth < 1 && entries.length <= 100);

  return (
    <div className="j-node">
      <div className="j-line" onClick={() => setOpen((o) => !o)}>
        <ChevronIcon size={11} className={`j-chev ${open ? "open" : ""}`} />
        {keyName != null && <span className="j-key">{keyName}:</span>}
        {jsonString && <span className="j-tag">json</span>}
        {!open && <span className="j-summary">{summarize(effective)}</span>}
      </div>
      {open && (
        <div className="j-children">
          {entries.map(([k, v]) => (
            <JsonNode key={k} keyName={k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Interactive, lazily-rendered collapsible tree for any parsed value. */
export function JsonTree({ value }: { value: unknown }) {
  return (
    <div className="json-tree">
      <JsonNode value={value} depth={0} />
    </div>
  );
}

/** Non-JSON text shown in a preformatted block, truncated with show-all. */
export function PreText({ text }: { text: string }) {
  const [open, setOpen] = useState(text.length <= TEXT_PREVIEW);
  if (text.length <= TEXT_PREVIEW) return <pre className="body-pre">{text}</pre>;
  return (
    <pre className="body-pre">
      {open ? text : text.slice(0, TEXT_PREVIEW) + "…"}
      <button className="j-more block" onClick={() => setOpen((o) => !o)}>
        {open ? "show less" : `show all (${text.length} chars)`}
      </button>
    </pre>
  );
}

/** Render a raw body string as a JSON tree when parseable, else as text. */
export function JsonOrText({ text }: { text: string }) {
  const parsed = tryParseJson(text);
  if (parsed !== undefined) return <JsonTree value={parsed} />;
  return <PreText text={text} />;
}

/**
 * A storage/header value: inline when short, otherwise collapsed by default
 * with a one-line preview so huge values don't create long scrolls.
 */
export function CollapsibleValue({ value }: { value: string }) {
  const parsed = tryParseJson(value);
  const isJson = parsed !== undefined && isContainer(parsed);
  const big = isJson || value.length > 100;
  const [open, setOpen] = useState(false);

  if (!big) return <span className="cv-inline">{value}</span>;

  const preview = isJson
    ? summarize(parsed as Record<string, unknown> | unknown[])
    : `${value.slice(0, 80)}… (${value.length} chars)`;

  return (
    <div className="cv">
      <button className="cv-toggle" onClick={() => setOpen((o) => !o)}>
        <ChevronIcon size={11} className={`j-chev ${open ? "open" : ""}`} />
        <span className="cv-preview">{open ? "collapse" : preview}</span>
      </button>
      {open && (isJson ? <JsonTree value={parsed} /> : <PreText text={value} />)}
    </div>
  );
}
