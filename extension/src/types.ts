import type {
  ConsoleEvent,
  NetworkEntry,
  StorageSnapshot,
  RecordingManifest,
} from "@shared/format";

export type RecorderState = "idle" | "starting" | "recording" | "stopping";

export interface RecorderStatus {
  state: RecorderState;
  tabId: number | null;
  recordingStartEpochMs: number | null;
  counts: { console: number; network: number };
  error?: string | null;
}

/** Stored body bytes, ready to be zipped. */
export interface StoredBody {
  /** zip path, e.g. "bodies/1000.4.json" */
  path: string;
  /** true => `data` is base64; false => utf-8 text */
  base64: boolean;
  data: string;
}

/** Everything the offscreen document needs to assemble the zip (video lives there). */
export interface AssemblePayload {
  manifest: Omit<RecordingManifest, "durationMs" | "recordingEndEpochMs" | "videoStartOffsetMs" | "videoMissing">;
  console: ConsoleEvent[];
  network: NetworkEntry[];
  bodies: StoredBody[];
  storageStart: StorageSnapshot | null;
  storageEnd: StorageSnapshot | null;
}

// ---- Popup <-> background ----
export type PopupMessage =
  | { target: "background"; type: "GET_STATUS" }
  | { target: "background"; type: "START_RECORDING" }
  | { target: "background"; type: "STOP_RECORDING" };

export interface StatusResponse {
  ok: boolean;
  status: RecorderStatus;
  error?: string;
}

// ---- Background <-> offscreen ----
export type OffscreenMessage =
  | { target: "offscreen"; type: "OFFSCREEN_START"; streamId: string }
  | { target: "offscreen"; type: "OFFSCREEN_STOP_AND_DOWNLOAD"; payload: AssemblePayload }
  | { target: "offscreen"; type: "OFFSCREEN_ANCHOR_DOWNLOAD" }
  | { target: "offscreen"; type: "OFFSCREEN_ABORT" };

export interface OffscreenStartResult {
  ok: boolean;
  startEpochMs?: number;
  error?: string;
}

export interface OffscreenDownloadResult {
  ok: boolean;
  /** Blob URL created in the offscreen doc; the service worker triggers the download with it. */
  url?: string;
  filename?: string;
  durationMs?: number;
  error?: string;
}
