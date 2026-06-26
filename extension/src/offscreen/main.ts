import JSZip from "jszip";
import { FILES, type RecordingManifest } from "@shared/format";
import type {
  AssemblePayload,
  OffscreenDownloadResult,
  OffscreenMessage,
  OffscreenStartResult,
} from "../types";

let mediaStream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startEpochMs = 0;

// The assembled zip's blob URL + filename, kept alive for the SW to download
// (and for the anchor-click fallback). Revoked once the download is done.
let lastUrl: string | null = null;
let lastFilename = "recording.zip";

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

async function startCapture(streamId: string): Promise<OffscreenStartResult> {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // Chrome tab-capture constraints (non-standard; cast through unknown).
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      } as unknown as MediaTrackConstraints,
    });

    chunks = [];
    recorder = new MediaRecorder(mediaStream, {
      mimeType: pickMimeType(),
      videoBitsPerSecond: 4_000_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(1000); // gather a chunk per second
    startEpochMs = Date.now();
    return { ok: true, startEpochMs };
  } catch (e) {
    cleanupStream();
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function cleanupStream(): void {
  recorder = null;
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}

function stopRecorder(): Promise<Blob> {
  return new Promise((resolve) => {
    if (!recorder) {
      resolve(new Blob([], { type: "video/webm" }));
      return;
    }
    const mime = recorder.mimeType || "video/webm";
    recorder.onstop = () => {
      cleanupStream();
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

  const zip = new JSZip();
  zip.file(FILES.manifest, JSON.stringify(manifest, null, 2));
  if (!videoMissing) {
    zip.file(FILES.video, video, { compression: "STORE" });
  }
  zip.file(FILES.console, JSON.stringify(payload.console));
  zip.file(FILES.network, JSON.stringify(payload.network));
  zip.file(FILES.storageStart, JSON.stringify(payload.storageStart, null, 2));
  zip.file(FILES.storageEnd, JSON.stringify(payload.storageEnd, null, 2));
  for (const b of payload.bodies) {
    zip.file(b.path, b.data, { base64: b.base64 });
  }

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const stamp = new Date(payload.manifest.recordingStartEpochMs)
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("Z", "");
  return { blob, filename: `recording-${stamp}.zip` };
}

/**
 * Stop recording and assemble the zip into a blob URL. chrome.downloads is NOT
 * available in offscreen documents, so we hand the URL back to the service
 * worker, which triggers the actual download. Falls back to an anchor click
 * (OFFSCREEN_ANCHOR_DOWNLOAD) if the SW can't use the URL.
 */
async function stopAndDownload(
  payload: AssemblePayload,
): Promise<OffscreenDownloadResult> {
  try {
    const video = await stopRecorder();
    const { blob, filename } = await assembleZip(payload, video);
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    lastFilename = filename;
    return {
      ok: true,
      url: lastUrl,
      filename,
      durationMs: Date.now() - startEpochMs,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Fallback path: download via an anchor click from within the offscreen doc. */
function anchorDownload(): OffscreenDownloadResult {
  if (!lastUrl) return { ok: false, error: "Nothing to download." };
  try {
    const a = document.createElement("a");
    a.href = lastUrl;
    a.download = lastFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

chrome.runtime.onMessage.addListener(
  (message: OffscreenMessage, _sender, sendResponse) => {
    if (!message || message.target !== "offscreen") return;

    switch (message.type) {
      case "OFFSCREEN_START":
        startCapture(message.streamId).then(sendResponse);
        return true;
      case "OFFSCREEN_STOP_AND_DOWNLOAD":
        stopAndDownload(message.payload).then(sendResponse);
        return true;
      case "OFFSCREEN_ANCHOR_DOWNLOAD":
        sendResponse(anchorDownload());
        return true;
      case "OFFSCREEN_ABORT":
        cleanupStream();
        if (lastUrl) {
          URL.revokeObjectURL(lastUrl);
          lastUrl = null;
        }
        sendResponse({ ok: true });
        return true;
    }
  },
);
