// Event-page background. Opens the recorder window on toolbar click, injects
// the content-script capture into the target tab, buffers captured events
// against the recording clock, and assembles the payload for the recorder.
import {
  FORMAT_VERSION,
  type ConsoleEvent,
  type CookieRecord,
  type NetworkEntry,
  type StorageSnapshot,
} from "@shared/format";
import type {
  AssemblePayload,
  PageEvent,
  PageNetworkEvent,
  PageStorageReply,
  RuntimeMessage,
  StatusReply,
  StoredBody,
} from "./messages";

const BODY_CAP_BYTES = 2 * 1024 * 1024;

let recorderWindowId: number | null = null;
let targetTabId: number | null = null;
let recording = false;
let recordingStartEpochMs = 0;
let viewport = { w: 0, h: 0 };

let consoleEvents: ConsoleEvent[] = [];
let network: NetworkEntry[] = [];
let bodies: StoredBody[] = [];
let storageStart: StorageSnapshot | null = null;

const byteLen = (s: string) => new TextEncoder().encode(s).length;
const offset = (epochMs: number) =>
  Math.max(0, Math.round(epochMs - recordingStartEpochMs));

function extForMime(mime: string): string {
  if (/json/.test(mime)) return "json";
  if (/^text\//.test(mime) || /javascript|xml|html|css/.test(mime)) return "txt";
  return "bin";
}

// ---- open recorder window on toolbar click ----
browser.action.onClicked.addListener(async (tab) => {
  if (recorderWindowId != null) {
    await browser.windows.update(recorderWindowId, { focused: true }).catch(() => {});
    return;
  }
  if (!tab.id || (tab.url && /^(about|moz-extension|chrome):/.test(tab.url))) {
    return;
  }
  targetTabId = tab.id;
  const url = browser.runtime.getURL(
    `recorder.html?tabId=${tab.id}&title=${encodeURIComponent(tab.title ?? "")}`,
  );
  const win = await browser.windows.create({
    url,
    type: "popup",
    width: 440,
    height: 340,
  });
  recorderWindowId = win.id ?? null;
});

browser.windows.onRemoved.addListener((winId) => {
  if (winId === recorderWindowId) {
    recorderWindowId = null;
    resetRecording();
  }
});

// ---- messaging ----
browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
  switch (message?.type) {
    case "CAPTURE_EVENT":
      if (recording) handleCapture(message.event);
      return undefined;
    case "RECORDING_STARTED":
      return onRecordingStarted(message.tabId, message.startEpochMs);
    case "GET_STATUS":
      return Promise.resolve<StatusReply>({
        recording,
        counts: { console: consoleEvents.length, network: network.length },
      });
    case "GET_PAYLOAD":
      return buildPayload();
    case "RECORDING_DONE":
      resetRecording();
      return undefined;
    default:
      return undefined;
  }
});

function resetRecording(): void {
  recording = false;
  consoleEvents = [];
  network = [];
  bodies = [];
  storageStart = null;
}

async function onRecordingStarted(
  tabId: number,
  startEpochMs: number,
): Promise<{ ok: boolean; error?: string }> {
  targetTabId = tabId;
  recordingStartEpochMs = startEpochMs;
  recording = true;
  consoleEvents = [];
  network = [];
  bodies = [];

  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (e) {
    return { ok: false, error: `Could not inject capture: ${String(e)}` };
  }
  storageStart = await snapshotStorage(0).catch(() => null);
  return { ok: true };
}

function handleCapture(event: PageEvent): void {
  if (event.kind === "console") {
    consoleEvents.push({
      offsetMs: offset(event.time),
      level: event.level,
      source: event.source,
      args: event.args,
      text: event.text,
      stackTrace: event.stack
        ? [{ fn: "", url: event.stack.split("\n")[1]?.trim() ?? "", line: 0, col: 0 }]
        : undefined,
    });
  } else {
    network.push(toNetworkEntry(event));
  }
}

function toNetworkEntry(ev: PageNetworkEvent): NetworkEntry {
  const start = offset(ev.startTime);
  const end = offset(ev.endTime);

  let respBody = null;
  if (ev.resBody != null) {
    const size = byteLen(ev.resBody);
    if (size <= BODY_CAP_BYTES) {
      const path = `bodies/${ev.id}.${extForMime(ev.resMime)}`;
      bodies.push({ path, base64: false, data: ev.resBody });
      respBody = { path, mimeType: ev.resMime, size, truncated: false, base64: false };
    } else {
      respBody = { path: null, mimeType: ev.resMime, size, truncated: true, base64: false };
    }
  }

  let reqBody = null;
  if (ev.reqBody) {
    const size = byteLen(ev.reqBody);
    const path = `bodies/${ev.id}-req.txt`;
    bodies.push({ path, base64: false, data: ev.reqBody });
    reqBody = { path, mimeType: "text/plain", size, truncated: false, base64: false };
  }

  return {
    requestId: ev.id,
    offsetMs: start,
    request: {
      method: ev.method,
      url: ev.url,
      headers: ev.reqHeaders,
      body: reqBody,
    },
    response: ev.failed
      ? null
      : {
          status: ev.status,
          statusText: ev.statusText,
          headers: ev.resHeaders,
          mimeType: ev.resMime,
          body: respBody,
        },
    timing: { startOffsetMs: start, endOffsetMs: end, durationMs: Math.max(0, end - start) },
    status: ev.failed ? "failed" : "finished",
    errorText: ev.errorText ?? null,
  };
}

async function snapshotStorage(offsetMs: number): Promise<StorageSnapshot | null> {
  if (targetTabId == null) return null;
  let reply: PageStorageReply | undefined;
  try {
    reply = (await browser.tabs.sendMessage(targetTabId, {
      type: "SNAPSHOT_STORAGE",
    })) as PageStorageReply;
  } catch {
    /* content script not present */
  }
  if (reply?.viewport) viewport = reply.viewport;

  const tab = await browser.tabs.get(targetTabId).catch(() => undefined);
  let cookies: CookieRecord[] = [];
  try {
    if (tab?.url && /^https?:/.test(tab.url)) {
      const cs = await browser.cookies.getAll({ url: tab.url });
      cookies = cs.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expirationDate ?? 0,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite ?? "unspecified",
      }));
    }
  } catch {
    /* cookies unavailable */
  }

  return {
    offsetMs,
    origin: reply?.origin || tab?.url || "",
    localStorage: reply?.localStorage ?? {},
    sessionStorage: reply?.sessionStorage ?? {},
    cookies,
    indexedDB: reply?.indexedDB,
    indexedDBError: reply?.indexedDBError,
  };
}

async function buildPayload(): Promise<AssemblePayload> {
  const endOffset = Math.max(0, Date.now() - recordingStartEpochMs);
  const storageEnd = await snapshotStorage(endOffset).catch(() => null);

  const tab = targetTabId != null ? await browser.tabs.get(targetTabId).catch(() => undefined) : undefined;

  consoleEvents.sort((a, b) => a.offsetMs - b.offsetMs);
  network.sort((a, b) => a.offsetMs - b.offsetMs);

  return {
    manifest: {
      formatVersion: FORMAT_VERSION,
      recordingStartEpochMs,
      page: {
        url: tab?.url ?? "",
        title: tab?.title ?? "",
        userAgent: navigator.userAgent,
        viewport,
      },
      counts: { console: consoleEvents.length, network: network.length },
      bodyCapBytes: BODY_CAP_BYTES,
    },
    console: consoleEvents,
    network,
    bodies,
    storageStart,
    storageEnd,
  };
}
