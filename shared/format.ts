/**
 * QA Recording zip format — the contract between the extension (producer) and
 * the viewer (consumer). Both packages import these types so the schema has a
 * single source of truth.
 *
 * Zip layout:
 *   recording-<timestamp>.zip
 *   ├── manifest.json          RecordingManifest
 *   ├── video.webm             tab screen recording
 *   ├── console.json           ConsoleEvent[]
 *   ├── network.json           NetworkEntry[]
 *   ├── bodies/                request/response bodies, keyed by requestId
 *   │   └── <requestId>.<ext>
 *   └── storage/
 *       ├── snapshot-start.json  StorageSnapshot
 *       └── snapshot-end.json    StorageSnapshot
 *
 * Timing model: a single clock. `recordingStartEpochMs` is captured the moment
 * recording begins. Every event carries `offsetMs = eventEpochMs - recordingStartEpochMs`.
 * The viewer drives all panels off the <video> element's currentTime:
 *   playheadMs = video.currentTime * 1000 + videoStartOffsetMs
 */

export const FORMAT_VERSION = 1;

export const FILES = {
  manifest: "manifest.json",
  video: "video.webm",
  console: "console.json",
  network: "network.json",
  bodiesDir: "bodies/",
  storageStart: "storage/snapshot-start.json",
  storageEnd: "storage/snapshot-end.json",
} as const;

export interface RecordingManifest {
  formatVersion: number;
  /** Epoch ms captured when MediaRecorder.start() fired — the t=0 of the recording. */
  recordingStartEpochMs: number;
  recordingEndEpochMs: number;
  durationMs: number;
  /**
   * Delta in ms between recordingStartEpochMs and the first video frame.
   * playheadMs = video.currentTime * 1000 + videoStartOffsetMs.
   */
  videoStartOffsetMs: number;
  /** True if no video track was captured (e.g. user cancelled the share dialog). */
  videoMissing?: boolean;
  page: {
    url: string;
    title: string;
    userAgent: string;
    viewport: { w: number; h: number };
  };
  counts: {
    console: number;
    network: number;
  };
  /** Response/request bodies larger than this were omitted and flagged. */
  bodyCapBytes: number;
}

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";
export type ConsoleSource = "console" | "exception" | "browser";

export interface StackFrame {
  url: string;
  line: number;
  col: number;
  fn: string;
}

/**
 * A serialized console argument. Primitives are stored as-is; non-serializable
 * values (objects, functions, DOM nodes) become a tagged preview object.
 */
export type SerializedArg =
  | string
  | number
  | boolean
  | null
  | { __type: string; preview: string };

export interface ConsoleEvent {
  offsetMs: number;
  level: ConsoleLevel;
  source: ConsoleSource;
  /** Structured arguments as passed to console.* (best-effort serialization). */
  args: SerializedArg[];
  /** Flattened, human-readable single-line message. */
  text: string;
  stackTrace?: StackFrame[];
}

export type NetworkStatus = "finished" | "failed" | "pending";

export interface BodyRef {
  /** Path within the zip, e.g. "bodies/1000.4.json". Null when no body captured. */
  path: string | null;
  mimeType: string;
  size: number;
  /** True if the body exceeded bodyCapBytes and was omitted. */
  truncated: boolean;
  /** True if stored as base64 (binary); false for utf-8 text. */
  base64: boolean;
}

export interface NetworkEntry {
  requestId: string;
  /** Offset of requestWillBeSent. */
  offsetMs: number;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    resourceType?: string;
    body: BodyRef | null;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    mimeType: string;
    remoteIPAddress?: string;
    fromCache?: boolean;
    body: BodyRef | null;
  } | null;
  timing: {
    startOffsetMs: number;
    endOffsetMs: number | null;
    durationMs: number | null;
  };
  status: NetworkStatus;
  errorText?: string | null;
}

export interface CookieRecord {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
}

export interface StorageSnapshot {
  offsetMs: number;
  origin: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: CookieRecord[];
  /** Best-effort. Shape: { dbName: { storeName: row[] } }. May be omitted on failure. */
  indexedDB?: Record<string, Record<string, unknown[]>>;
  /** Set when IndexedDB capture failed or was skipped. */
  indexedDBError?: string;
}

/** Fully parsed recording handed to the viewer UI after reading the zip. */
export interface ParsedRecording {
  manifest: RecordingManifest;
  console: ConsoleEvent[];
  network: NetworkEntry[];
  storageStart: StorageSnapshot | null;
  storageEnd: StorageSnapshot | null;
  /** Object URL for video.webm, or null when videoMissing. */
  videoUrl: string | null;
  /** Resolves a BodyRef.path to its text/blob; backed by the loaded zip. */
  readBody: (path: string) => Promise<{ text: string | null; blob: Blob }>;
}
