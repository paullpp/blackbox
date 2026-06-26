import type {
  ConsoleEvent,
  ConsoleLevel,
  NetworkEntry,
  RecordingManifest,
  SerializedArg,
  StorageSnapshot,
} from "@shared/format";

/** Console/error event captured in the page (MAIN world). */
export interface PageConsoleEvent {
  kind: "console";
  level: ConsoleLevel;
  source: "console" | "exception";
  args: SerializedArg[];
  text: string;
  time: number; // epoch ms
  stack?: string;
}

/** A completed (or failed) network request captured by wrapping fetch/XHR. */
export interface PageNetworkEvent {
  kind: "network";
  id: string;
  method: string;
  url: string;
  reqHeaders: Record<string, string>;
  reqBody?: string | null;
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  status: number; // 0 when failed
  statusText: string;
  resHeaders: Record<string, string>;
  resMime: string;
  resBody?: string | null; // text body if captured (and small enough)
  failed?: boolean;
  errorText?: string;
}

export type PageEvent = PageConsoleEvent | PageNetworkEvent;

/** window.postMessage envelope (page-capture -> content script). */
export interface PageEnvelope {
  __blackbox: true;
  event: PageEvent;
}

/** Storage read by the content script (same origin as the page). */
export interface PageStorageReply {
  origin: string;
  viewport: { w: number; h: number };
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  indexedDB?: Record<string, Record<string, unknown[]>>;
  indexedDBError?: string;
}

// ---- runtime messages ----
export type RuntimeMessage =
  | { type: "CAPTURE_EVENT"; event: PageEvent } // content -> background
  | { type: "SNAPSHOT_STORAGE" } // background -> content
  | { type: "RECORDING_STARTED"; tabId: number; startEpochMs: number } // recorder -> background
  | { type: "GET_PAYLOAD" } // recorder -> background
  | { type: "GET_STATUS" } // recorder -> background
  | { type: "RECORDING_DONE" }; // recorder -> background

export interface StatusReply {
  recording: boolean;
  counts: { console: number; network: number };
}

/** Body bytes destined for the zip's bodies/ folder. */
export interface StoredBody {
  path: string;
  base64: boolean;
  data: string;
}

/** Everything the recorder window needs to assemble the zip (it holds the video). */
export interface AssemblePayload {
  manifest: Omit<
    RecordingManifest,
    "durationMs" | "recordingEndEpochMs" | "videoStartOffsetMs" | "videoMissing"
  >;
  console: ConsoleEvent[];
  network: NetworkEntry[];
  bodies: StoredBody[];
  storageStart: StorageSnapshot | null;
  storageEnd: StorageSnapshot | null;
}
