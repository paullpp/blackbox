import {
  FORMAT_VERSION,
  type ConsoleEvent,
  type NetworkEntry,
  type BodyRef,
} from "@shared/format";
import type { AssemblePayload, StoredBody } from "../types";
import { captureStorage } from "./storage";
import {
  consoleApiTypeToLevel,
  convertStackTrace,
  flattenArgs,
  logEntryLevelToLevel,
  serializeRemoteObject,
  type CdpStackTrace,
  type RemoteObject,
} from "../lib/serialize";

const DEBUGGER_VERSION = "1.3";
export const BODY_CAP_BYTES = 5 * 1024 * 1024;

function extForMime(mime: string): string {
  if (/json/.test(mime)) return "json";
  if (/^text\//.test(mime) || /javascript|xml|html|css/.test(mime)) return "txt";
  return "bin";
}

/**
 * Owns one recording session for a single tab: attaches the debugger, captures
 * console + network events normalized to a single clock, fetches response
 * bodies, and produces an AssemblePayload for the offscreen document to zip.
 */
export class Recorder {
  readonly tabId: number;
  private target: chrome.debugger.Debuggee;

  recordingStartEpochMs = 0;
  private monoBaseMs: number | null = null; // wallTimeMs - monotonicSec*1000

  console: ConsoleEvent[] = [];
  private network = new Map<string, NetworkEntry>();
  private bodies: StoredBody[] = [];
  private bodyTasks: Promise<void>[] = [];

  private attached = false;

  constructor(tabId: number) {
    this.tabId = tabId;
    this.target = { tabId };
  }

  get counts() {
    return { console: this.console.length, network: this.network.size };
  }

  /** Attach the debugger and begin capturing. Call after the video clock starts. */
  async start(recordingStartEpochMs: number): Promise<void> {
    this.recordingStartEpochMs = recordingStartEpochMs;
    await chrome.debugger.attach(this.target, DEBUGGER_VERSION);
    this.attached = true;
    chrome.debugger.onEvent.addListener(this.handleEvent);

    await this.send("Network.enable");
    await this.send("Runtime.enable");
    await this.send("Log.enable");
    await this.send("Page.enable");
  }

  /** Stop capturing, take the end storage snapshot, and build the zip payload. */
  async finish(
    storageStartPromise: Promise<import("@shared/format").StorageSnapshot | null>,
    page: { url: string; title: string; viewport: { w: number; h: number } },
  ): Promise<AssemblePayload> {
    // Wait for in-flight body fetches before detaching.
    await Promise.allSettled(this.bodyTasks);

    const tab = await chrome.tabs.get(this.tabId).catch(() => undefined);
    const endOffset = Math.max(0, Date.now() - this.recordingStartEpochMs);
    const storageEnd = await captureStorage(this.tabId, tab?.url, endOffset).catch(
      () => null,
    );

    this.detach();

    const storageStart = await storageStartPromise.catch(() => null);
    const network = [...this.network.values()].sort(
      (a, b) => a.offsetMs - b.offsetMs,
    );
    this.console.sort((a, b) => a.offsetMs - b.offsetMs);

    return {
      manifest: {
        formatVersion: FORMAT_VERSION,
        recordingStartEpochMs: this.recordingStartEpochMs,
        page: {
          url: page.url,
          title: page.title,
          userAgent: navigator.userAgent,
          viewport: page.viewport,
        },
        counts: { console: this.console.length, network: network.length },
        bodyCapBytes: BODY_CAP_BYTES,
      },
      console: this.console,
      network,
      bodies: this.bodies,
      storageStart,
      storageEnd,
    };
  }

  detach(): void {
    if (!this.attached) return;
    chrome.debugger.onEvent.removeListener(this.handleEvent);
    chrome.debugger.detach(this.target).catch(() => {});
    this.attached = false;
  }

  // ---- internals ----

  private send<T = unknown>(method: string, params?: object): Promise<T> {
    return chrome.debugger.sendCommand(this.target, method, params) as Promise<T>;
  }

  private offsetFromEpochMs(epochMs: number): number {
    return Math.max(0, Math.round(epochMs - this.recordingStartEpochMs));
  }

  private offsetFromMonotonic(tsSec: number): number {
    if (this.monoBaseMs == null) {
      return Math.max(0, Date.now() - this.recordingStartEpochMs);
    }
    return this.offsetFromEpochMs(tsSec * 1000 + this.monoBaseMs);
  }

  private handleEvent = (
    source: chrome.debugger.Debuggee,
    method: string,
    params?: object,
  ): void => {
    if (source.tabId !== this.tabId) return;
    const p = (params ?? {}) as Record<string, unknown>;
    switch (method) {
      case "Runtime.consoleAPICalled":
        return this.onConsoleApi(p);
      case "Runtime.exceptionThrown":
        return this.onException(p);
      case "Log.entryAdded":
        return this.onLogEntry(p);
      case "Network.requestWillBeSent":
        return this.onRequestWillBeSent(p);
      case "Network.responseReceived":
        return this.onResponseReceived(p);
      case "Network.loadingFinished":
        return this.onLoadingFinished(p);
      case "Network.loadingFailed":
        return this.onLoadingFailed(p);
    }
  };

  // ---- console ----

  private onConsoleApi(p: Record<string, unknown>): void {
    const args = ((p.args as RemoteObject[]) || []).map(serializeRemoteObject);
    this.console.push({
      offsetMs: this.offsetFromEpochMs((p.timestamp as number) ?? Date.now()),
      level: consoleApiTypeToLevel((p.type as string) || "log"),
      source: "console",
      args,
      text: flattenArgs(args),
      stackTrace: convertStackTrace(p.stackTrace as CdpStackTrace),
    });
  }

  private onException(p: Record<string, unknown>): void {
    const details = (p.exceptionDetails as Record<string, unknown>) || {};
    const exception = details.exception as RemoteObject | undefined;
    const text =
      exception?.description ||
      (details.text as string) ||
      "Uncaught (in promise) exception";
    this.console.push({
      offsetMs: this.offsetFromEpochMs((p.timestamp as number) ?? Date.now()),
      level: "error",
      source: "exception",
      args: [text],
      text,
      stackTrace: convertStackTrace(details.stackTrace as CdpStackTrace),
    });
  }

  private onLogEntry(p: Record<string, unknown>): void {
    const entry = (p.entry as Record<string, unknown>) || {};
    const text = (entry.text as string) || "";
    this.console.push({
      offsetMs: this.offsetFromEpochMs((entry.timestamp as number) ?? Date.now()),
      level: logEntryLevelToLevel((entry.level as string) || "info"),
      source: "browser",
      args: [text],
      text,
      stackTrace: convertStackTrace(entry.stackTrace as CdpStackTrace),
    });
  }

  // ---- network ----

  private maybeSetMonoBase(p: Record<string, unknown>): void {
    if (this.monoBaseMs != null) return;
    const wallTime = p.wallTime as number | undefined; // seconds since epoch
    const timestamp = p.timestamp as number | undefined; // monotonic seconds
    if (typeof wallTime === "number" && typeof timestamp === "number") {
      this.monoBaseMs = wallTime * 1000 - timestamp * 1000;
    }
  }

  private onRequestWillBeSent(p: Record<string, unknown>): void {
    this.maybeSetMonoBase(p);
    const requestId = p.requestId as string;
    const req = (p.request as Record<string, unknown>) || {};
    const wallTime = p.wallTime as number | undefined;
    const offsetMs =
      typeof wallTime === "number"
        ? this.offsetFromEpochMs(wallTime * 1000)
        : this.offsetFromMonotonic((p.timestamp as number) ?? 0);

    // Capture inline request post data when present.
    let reqBody: BodyRef | null = null;
    const postData = req.postData as string | undefined;
    if (postData) {
      const size = new Blob([postData]).size;
      if (size <= BODY_CAP_BYTES) {
        const path = `bodies/${requestId}-req.txt`;
        this.bodies.push({ path, base64: false, data: postData });
        reqBody = { path, mimeType: "text/plain", size, truncated: false, base64: false };
      } else {
        reqBody = { path: null, mimeType: "text/plain", size, truncated: true, base64: false };
      }
    }

    this.network.set(requestId, {
      requestId,
      offsetMs,
      request: {
        method: (req.method as string) || "GET",
        url: (req.url as string) || "",
        headers: (req.headers as Record<string, string>) || {},
        resourceType: p.type as string | undefined,
        body: reqBody,
      },
      response: null,
      timing: { startOffsetMs: offsetMs, endOffsetMs: null, durationMs: null },
      status: "pending",
    });
  }

  private onResponseReceived(p: Record<string, unknown>): void {
    const entry = this.network.get(p.requestId as string);
    if (!entry) return;
    const res = (p.response as Record<string, unknown>) || {};
    entry.response = {
      status: (res.status as number) ?? 0,
      statusText: (res.statusText as string) || "",
      headers: (res.headers as Record<string, string>) || {},
      mimeType: (res.mimeType as string) || "",
      remoteIPAddress: res.remoteIPAddress as string | undefined,
      fromCache: Boolean(res.fromDiskCache),
      body: null,
    };
  }

  private onLoadingFinished(p: Record<string, unknown>): void {
    const requestId = p.requestId as string;
    const entry = this.network.get(requestId);
    if (!entry) return;
    const end = this.offsetFromMonotonic((p.timestamp as number) ?? 0);
    entry.timing.endOffsetMs = end;
    entry.timing.durationMs = Math.max(0, end - entry.timing.startOffsetMs);
    entry.status = "finished";
    this.bodyTasks.push(this.fetchBody(requestId, entry));
  }

  private onLoadingFailed(p: Record<string, unknown>): void {
    const entry = this.network.get(p.requestId as string);
    if (!entry) return;
    const end = this.offsetFromMonotonic((p.timestamp as number) ?? 0);
    entry.timing.endOffsetMs = end;
    entry.timing.durationMs = Math.max(0, end - entry.timing.startOffsetMs);
    entry.status = "failed";
    entry.errorText = (p.errorText as string) || "Failed";
  }

  private async fetchBody(requestId: string, entry: NetworkEntry): Promise<void> {
    if (!entry.response) return;
    const mime = entry.response.mimeType || "application/octet-stream";
    try {
      const r = await this.send<{ body: string; base64Encoded: boolean }>(
        "Network.getResponseBody",
        { requestId },
      );
      if (r.body == null) return;
      const size = r.base64Encoded
        ? Math.floor((r.body.length * 3) / 4)
        : new Blob([r.body]).size;

      if (size > BODY_CAP_BYTES) {
        entry.response.body = { path: null, mimeType: mime, size, truncated: true, base64: r.base64Encoded };
        return;
      }
      // CDP's flag is authoritative: if base64Encoded, the bytes are base64
      // regardless of mime. The viewer decodes per the stored `base64` flag.
      const base64 = r.base64Encoded;
      const path = `bodies/${requestId}.${extForMime(mime)}`;
      this.bodies.push({ path, base64, data: r.body });
      entry.response.body = { path, mimeType: mime, size, truncated: false, base64 };
    } catch {
      // No body available (e.g. 204, redirect, cache) — leave body null.
    }
  }
}
