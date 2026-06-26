// Runs in the page's MAIN world (injected as a web-accessible script). Patches
// console + error handlers and wraps fetch/XHR, posting captured events to the
// content script via window.postMessage. Must be self-contained (no runtime
// imports) — types are erased at build time.
import type { ConsoleLevel, SerializedArg } from "@shared/format";
import type { PageEvent } from "./messages";

(() => {
  // Guard against double-wrapping if the content script is injected twice.
  const w = window as unknown as { __bbCapture?: boolean };
  if (w.__bbCapture) return;
  w.__bbCapture = true;

  const BODY_CAP = 2 * 1024 * 1024; // 2MB text-body cap
  let seq = 0;
  const nextId = () => `fx-${Date.now().toString(36)}-${(seq++).toString(36)}`;

  function emit(event: PageEvent): void {
    try {
      window.postMessage({ __blackbox: true, event }, "*");
    } catch {
      /* serialization failure — drop the event */
    }
  }

  // ---- value serialization ----
  function previewObject(v: unknown): string {
    if (Array.isArray(v)) return `Array(${v.length})`;
    try {
      const s = JSON.stringify(v);
      if (s && s.length <= 200) return s;
      if (s) return s.slice(0, 197) + "…";
    } catch {
      /* circular / non-serializable */
    }
    return Object.prototype.toString.call(v);
  }

  function serializeArg(v: unknown): SerializedArg {
    if (v === null) return null;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") {
      return v as string | number | boolean;
    }
    if (t === "undefined") return { __type: "undefined", preview: "undefined" };
    if (t === "function") {
      const name = (v as { name?: string }).name;
      return { __type: "function", preview: name ? `ƒ ${name}` : "ƒ" };
    }
    if (t === "bigint") return { __type: "bigint", preview: `${String(v)}n` };
    if (t === "symbol") return { __type: "symbol", preview: String(v) };
    const ctor = (v as { constructor?: { name?: string } })?.constructor?.name;
    return { __type: ctor || "object", preview: previewObject(v) };
  }

  function textOf(v: unknown): string {
    if (v === null) return "null";
    const t = typeof v;
    if (t === "string") return v as string;
    if (t === "number" || t === "boolean" || t === "bigint") return String(v);
    if (t === "undefined") return "undefined";
    const a = serializeArg(v);
    return typeof a === "object" && a !== null ? a.preview : String(a);
  }

  // ---- console ----
  const levels: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];
  for (const level of levels) {
    const orig = console[level] as (...args: unknown[]) => void;
    console[level] = function (...args: unknown[]) {
      emit({
        kind: "console",
        level,
        source: "console",
        args: args.map(serializeArg),
        text: args.map(textOf).join(" "),
        time: Date.now(),
      });
      return orig.apply(console, args);
    };
  }

  window.addEventListener("error", (e) => {
    emit({
      kind: "console",
      level: "error",
      source: "exception",
      args: [e.message],
      text:
        e.message +
        (e.filename ? ` (${e.filename}:${e.lineno}:${e.colno})` : ""),
      time: Date.now(),
      stack: e.error?.stack,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    emit({
      kind: "console",
      level: "error",
      source: "exception",
      args: [String(r?.message ?? r)],
      text: "Unhandled promise rejection: " + String(r?.message ?? r),
      time: Date.now(),
      stack: r?.stack,
    });
  });

  // ---- helpers ----
  const isTexty = (mime: string) =>
    /^text\//.test(mime) || /json|javascript|xml|html|css|urlencoded/.test(mime);

  function headersToObj(h: HeadersInit | Headers | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!h) return out;
    if (h instanceof Headers) {
      h.forEach((v, k) => (out[k] = v));
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) out[k] = v;
    } else {
      Object.assign(out, h);
    }
    return out;
  }

  function parseRawHeaders(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of raw.trim().split(/[\r\n]+/)) {
      const i = line.indexOf(":");
      if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    return out;
  }

  const absUrl = (u: string) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return u;
    }
  };

  // ---- fetch ----
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
      const [input, init] = args;
      const req = input instanceof Request ? input : null;
      const method = (init?.method || req?.method || "GET").toUpperCase();
      const url = absUrl(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url,
      );
      const reqHeaders = headersToObj(init?.headers ?? req?.headers);
      const reqBody = typeof init?.body === "string" ? init.body : null;
      const startTime = Date.now();

      return origFetch.apply(this, args).then(
        async (res) => {
          const endTime = Date.now();
          const resMime = res.headers.get("content-type") || "";
          let resBody: string | null = null;
          try {
            if (isTexty(resMime)) {
              const t = await res.clone().text();
              resBody = t.length <= BODY_CAP ? t : null;
            }
          } catch {
            /* opaque/streamed body */
          }
          emit({
            kind: "network",
            id: nextId(),
            method,
            url,
            reqHeaders,
            reqBody,
            startTime,
            endTime,
            status: res.status,
            statusText: res.statusText,
            resHeaders: headersToObj(res.headers),
            resMime,
            resBody,
          });
          return res;
        },
        (err) => {
          emit({
            kind: "network",
            id: nextId(),
            method,
            url,
            reqHeaders,
            reqBody,
            startTime,
            endTime: Date.now(),
            status: 0,
            statusText: "",
            resHeaders: {},
            resMime: "",
            failed: true,
            errorText: String(err),
          });
          throw err;
        },
      );
    } as typeof fetch;
  }

  // ---- XMLHttpRequest ----
  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR(this: XMLHttpRequest) {
    const xhr = new OrigXHR();
    let method = "GET";
    let url = "";
    let reqHeaders: Record<string, string> = {};
    let startTime = 0;

    const origOpen = xhr.open;
    xhr.open = function (m: string, u: string | URL, ...rest: unknown[]) {
      method = m;
      url = typeof u === "string" ? u : u.href;
      // @ts-expect-error variadic passthrough
      return origOpen.call(xhr, m, u, ...rest);
    };
    const origSetHeader = xhr.setRequestHeader;
    xhr.setRequestHeader = function (k: string, v: string) {
      reqHeaders[k] = v;
      return origSetHeader.call(xhr, k, v);
    };
    const origSend = xhr.send;
    xhr.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      startTime = Date.now();
      xhr.addEventListener("loadend", () => {
        const endTime = Date.now();
        const resMime = xhr.getResponseHeader("content-type") || "";
        let resBody: string | null = null;
        try {
          if (
            isTexty(resMime) &&
            (xhr.responseType === "" || xhr.responseType === "text") &&
            typeof xhr.responseText === "string" &&
            xhr.responseText.length <= BODY_CAP
          ) {
            resBody = xhr.responseText;
          }
        } catch {
          /* responseText not accessible for this responseType */
        }
        const failed = xhr.status === 0;
        emit({
          kind: "network",
          id: nextId(),
          method: method.toUpperCase(),
          url: absUrl(url),
          reqHeaders,
          reqBody: typeof body === "string" ? body : null,
          startTime,
          endTime,
          status: xhr.status,
          statusText: xhr.statusText,
          resHeaders: parseRawHeaders(xhr.getAllResponseHeaders()),
          resMime,
          resBody,
          failed,
          errorText: failed ? "Request failed or blocked" : undefined,
        });
      });
      return origSend.call(xhr, body ?? null);
    };
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  // Preserve readyState constants some libraries read off the constructor.
  Object.assign(PatchedXHR, {
    UNSENT: 0,
    OPENED: 1,
    HEADERS_RECEIVED: 2,
    LOADING: 3,
    DONE: 4,
  });
  window.XMLHttpRequest = PatchedXHR as unknown as typeof XMLHttpRequest;
})();
