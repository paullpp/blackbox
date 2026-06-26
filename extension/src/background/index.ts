import type { StorageSnapshot } from "@shared/format";
import type {
  OffscreenDownloadResult,
  OffscreenStartResult,
  PopupMessage,
  RecorderStatus,
  StatusResponse,
} from "../types";
import { Recorder } from "./recorder";
import { captureStorage, readViewport } from "./storage";

const OFFSCREEN_URL = "offscreen.html";

let recorder: Recorder | null = null;
let startStorageSnapshot: Promise<StorageSnapshot | null> = Promise.resolve(null);
let status: RecorderStatus = {
  state: "idle",
  tabId: null,
  recordingStartEpochMs: null,
  counts: { console: 0, network: 0 },
  error: null,
};

function setStatus(patch: Partial<RecorderStatus>): void {
  status = { ...status, ...patch };
}

function currentStatus(): RecorderStatus {
  if (recorder && status.state === "recording") {
    return { ...status, counts: recorder.counts };
  }
  return status;
}

// ---- offscreen document lifecycle ----

async function hasOffscreen(): Promise<boolean> {
  const getContexts = (
    chrome.runtime as unknown as {
      getContexts?: (filter: object) => Promise<unknown[]>;
    }
  ).getContexts;
  if (!getContexts) return false;
  const contexts = await getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  return Array.isArray(contexts) && contexts.length > 0;
}

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA],
    justification: "Record the tab via MediaRecorder and assemble the download zip.",
  });
}

async function closeOffscreen(): Promise<void> {
  if (await hasOffscreen()) {
    await Promise.resolve(chrome.offscreen.closeDocument()).catch(() => {});
  }
}

function sendToOffscreen<T>(message: object): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

// chrome.downloads is unavailable in offscreen docs, so the SW downloads the
// blob URL the offscreen doc created. The offscreen doc must stay open until
// the download has read the blob.
function startDownload(url: string, filename: string): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename }, (id) => {
      const err = chrome.runtime.lastError;
      if (err || id === undefined) {
        reject(new Error(err?.message || "download failed"));
      } else {
        resolve(id);
      }
    });
  });
}

function waitForDownload(id: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(listener);
      resolve();
    };
    const listener = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== id || !delta.state) return;
      const s = delta.state.current;
      if (s === "complete" || s === "interrupted") done();
    };
    const timer = setTimeout(done, 120_000);
    chrome.downloads.onChanged.addListener(listener);
  });
}

// ---- recording flow ----

async function startRecording(): Promise<void> {
  if (status.state !== "idle") throw new Error(`Cannot start while ${status.state}`);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab to record.");
  if (tab.url && /^(chrome|edge|about|chrome-extension):/.test(tab.url)) {
    throw new Error("Cannot record browser-internal pages.");
  }
  const tabId = tab.id;
  setStatus({ state: "starting", tabId, error: null });

  // 1. Get a tab-capture stream id (must be consumed by the offscreen doc).
  //    Wrapped in a Promise to support both callback- and promise-typed defs.
  const streamId = await new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      const err = chrome.runtime.lastError;
      if (err || !id) reject(new Error(err?.message || "getMediaStreamId failed"));
      else resolve(id);
    });
  });

  // 2. Spin up the offscreen doc and start the MediaRecorder; it returns the
  //    epoch at which recording began — our shared clock t=0.
  await ensureOffscreen();
  const startRes = await sendToOffscreen<OffscreenStartResult>({
    target: "offscreen",
    type: "OFFSCREEN_START",
    streamId,
  });
  if (!startRes?.ok || !startRes.startEpochMs) {
    await closeOffscreen();
    throw new Error(startRes?.error || "Failed to start video capture.");
  }
  const recordingStartEpochMs = startRes.startEpochMs;

  // 3. Attach the debugger and begin capturing, anchored to the video clock.
  recorder = new Recorder(tabId);
  try {
    await recorder.start(recordingStartEpochMs);
  } catch (e) {
    await sendToOffscreen({ target: "offscreen", type: "OFFSCREEN_ABORT" });
    await closeOffscreen();
    recorder = null;
    throw e;
  }

  // 4. Kick off the start storage snapshot in parallel (stored for finish()).
  startStorageSnapshot = captureStorage(tabId, tab.url, 0).catch(() => null);

  setStatus({
    state: "recording",
    recordingStartEpochMs,
    counts: { console: 0, network: 0 },
  });
}

async function stopRecording(): Promise<void> {
  if (status.state !== "recording" || !recorder) {
    throw new Error("Not recording.");
  }
  setStatus({ state: "stopping" });
  const activeRecorder = recorder;

  const tab = await chrome.tabs.get(activeRecorder.tabId).catch(() => undefined);
  const viewport = await readViewport(activeRecorder.tabId);

  const payload = await activeRecorder.finish(startStorageSnapshot, {
    url: tab?.url ?? "",
    title: tab?.title ?? "",
    viewport,
  });

  const result = await sendToOffscreen<OffscreenDownloadResult>({
    target: "offscreen",
    type: "OFFSCREEN_STOP_AND_DOWNLOAD",
    payload,
  });

  let downloadError: string | null = null;
  if (!result?.ok || !result.url) {
    downloadError = result?.error || "Failed to assemble recording.";
  } else {
    const filename = result.filename || "recording.zip";
    try {
      const id = await startDownload(result.url, filename);
      await waitForDownload(id);
    } catch (e) {
      // The SW couldn't fetch the offscreen blob URL — fall back to an anchor
      // click inside the offscreen doc, then give it a moment to read the blob.
      const fb = await sendToOffscreen<OffscreenDownloadResult>({
        target: "offscreen",
        type: "OFFSCREEN_ANCHOR_DOWNLOAD",
      });
      await new Promise((r) => setTimeout(r, 1500));
      if (!fb?.ok) {
        downloadError = fb?.error || (e instanceof Error ? e.message : String(e));
      }
    }
  }

  await closeOffscreen();
  recorder = null;
  setStatus({
    state: "idle",
    tabId: null,
    recordingStartEpochMs: null,
    counts: { console: 0, network: 0 },
    error: downloadError,
  });
}

// ---- cleanup on tab loss ----

chrome.tabs.onRemoved.addListener((tabId) => {
  if (recorder && recorder.tabId === tabId) {
    recorder.detach();
    recorder = null;
    void closeOffscreen();
    setStatus({
      state: "idle",
      tabId: null,
      recordingStartEpochMs: null,
      error: "Recorded tab was closed before stopping.",
    });
  }
});

chrome.debugger.onDetach.addListener((source) => {
  if (recorder && source.tabId === recorder.tabId && status.state === "recording") {
    // User clicked "Cancel" on the debugging banner.
    recorder.detach();
    recorder = null;
    void closeOffscreen();
    setStatus({
      state: "idle",
      tabId: null,
      recordingStartEpochMs: null,
      error: "Debugger detached (recording cancelled).",
    });
  }
});

// ---- popup messaging ----

chrome.runtime.onMessage.addListener((message: PopupMessage, _sender, sendResponse) => {
  if (!message || (message as { target?: string }).target !== "background") return;

  (async (): Promise<StatusResponse> => {
    try {
      switch (message.type) {
        case "GET_STATUS":
          return { ok: true, status: currentStatus() };
        case "START_RECORDING":
          await startRecording();
          return { ok: true, status: currentStatus() };
        case "STOP_RECORDING":
          await stopRecording();
          return { ok: true, status: currentStatus() };
        default:
          return { ok: false, status: currentStatus(), error: "Unknown message" };
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setStatus({ error });
      return { ok: false, status: currentStatus(), error };
    }
  })().then(sendResponse);

  return true; // async response
});
