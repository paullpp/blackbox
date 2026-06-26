// The recorder control window. Holds the getDisplayMedia stream + MediaRecorder
// (a persistent window so the stream survives), and on stop pulls the captured
// payload from the background, assembles the zip, and downloads it.
import { zipSync, strToU8, type Zippable } from "fflate";
import { FILES, type RecordingManifest } from "@shared/format";
import type { AssemblePayload, StatusReply } from "./messages";

const params = new URLSearchParams(location.search);
const tabId = Number(params.get("tabId"));
const tabTitle = params.get("title") || "the active tab";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const toggle = $<HTMLButtonElement>("toggle");
const errorBox = $("error");
const consoleCount = $("consoleCount");
const networkCount = $("networkCount");
const elapsed = $("elapsed");
const tabLabel = $("tabLabel");
tabLabel.textContent = "Recording: ";
const tabBold = document.createElement("b");
tabBold.textContent = tabTitle;
tabLabel.appendChild(tabBold);

let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startEpochMs = 0;
let state: "idle" | "recording" | "saving" = "idle";
let timer: number | undefined;
let statusPoll: number | undefined;

function showError(msg: string): void {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pickMimeType(): string {
  for (const c of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

toggle.addEventListener("click", () => {
  if (state === "idle") void start();
  else if (state === "recording") void stop();
});

async function start(): Promise<void> {
  errorBox.classList.add("hidden");
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false,
    });
  } catch (e) {
    showError(`Screen share was cancelled or failed: ${String(e)}`);
    return;
  }

  // If the user stops sharing via Firefox's UI, finish the recording.
  stream.getVideoTracks()[0]?.addEventListener("ended", () => {
    if (state === "recording") void stop();
  });

  chunks = [];
  recorder = new MediaRecorder(stream, {
    mimeType: pickMimeType(),
    videoBitsPerSecond: 4_000_000,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(1000);
  startEpochMs = Date.now();
  state = "recording";

  const res = (await browser.runtime.sendMessage({
    type: "RECORDING_STARTED",
    tabId,
    startEpochMs,
  })) as { ok: boolean; error?: string } | undefined;
  if (res && !res.ok) showError(res.error || "Capture could not start.");

  render();
  startTimers();
}

async function stop(): Promise<void> {
  state = "saving";
  render();
  stopTimers();

  const video = await stopRecorder();
  try {
    const payload = (await browser.runtime.sendMessage({
      type: "GET_PAYLOAD",
    })) as AssemblePayload;
    const { blob, filename } = await assembleZip(payload, video);
    await download(blob, filename);
  } catch (e) {
    showError(`Failed to save recording: ${String(e)}`);
    state = "idle";
    render();
    return;
  }

  await browser.runtime.sendMessage({ type: "RECORDING_DONE" });
  window.close();
}

function stopRecorder(): Promise<Blob> {
  return new Promise((resolve) => {
    if (!recorder) return resolve(new Blob([], { type: "video/webm" }));
    const mime = recorder.mimeType || "video/webm";
    recorder.onstop = () => {
      stream?.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: mime }));
    };
    recorder.stop();
  });
}

async function assembleZip(
  payload: AssemblePayload,
  video: Blob,
): Promise<{ blob: Blob; filename: string }> {
  const endEpochMs = Date.now();
  const videoMissing = video.size === 0;
  const manifest: RecordingManifest = {
    ...payload.manifest,
    recordingEndEpochMs: endEpochMs,
    durationMs: Math.max(0, endEpochMs - payload.manifest.recordingStartEpochMs),
    videoStartOffsetMs: 0,
    videoMissing,
  };

  const files: Zippable = {};
  files[FILES.manifest] = strToU8(JSON.stringify(manifest, null, 2));
  if (!videoMissing) {
    // Video is already compressed — store without re-deflating.
    files[FILES.video] = [new Uint8Array(await video.arrayBuffer()), { level: 0 }];
  }
  files[FILES.console] = strToU8(JSON.stringify(payload.console));
  files[FILES.network] = strToU8(JSON.stringify(payload.network));
  files[FILES.storageStart] = strToU8(JSON.stringify(payload.storageStart, null, 2));
  files[FILES.storageEnd] = strToU8(JSON.stringify(payload.storageEnd, null, 2));
  for (const b of payload.bodies) {
    files[b.path] = b.base64 ? base64ToBytes(b.data) : strToU8(b.data);
  }

  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: "application/zip" });
  const stamp = new Date(payload.manifest.recordingStartEpochMs)
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("Z", "");
  return { blob, filename: `recording-${stamp}.zip` };
}

async function download(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    await browser.downloads.download({ url, filename, saveAs: true });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

// ---- UI ----
function render(): void {
  toggle.classList.toggle("stop", state === "recording");
  if (state === "idle") {
    toggle.textContent = "Start recording";
    toggle.disabled = false;
  } else if (state === "recording") {
    toggle.textContent = "Stop & download";
    toggle.disabled = false;
  } else {
    toggle.textContent = "Saving…";
    toggle.disabled = true;
  }
}

function startTimers(): void {
  const tick = () => {
    const s = Math.floor((Date.now() - startEpochMs) / 1000);
    elapsed.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(
      s % 60,
    ).padStart(2, "0")}`;
  };
  tick();
  timer = window.setInterval(tick, 500);
  statusPoll = window.setInterval(async () => {
    const st = (await browser.runtime.sendMessage({ type: "GET_STATUS" })) as
      | StatusReply
      | undefined;
    if (st) {
      consoleCount.textContent = String(st.counts.console);
      networkCount.textContent = String(st.counts.network);
    }
  }, 1000);
}

function stopTimers(): void {
  window.clearInterval(timer);
  window.clearInterval(statusPoll);
}

render();
