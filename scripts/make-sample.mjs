// Generates a sample recording zip (no video) that conforms to shared/format.ts,
// so the viewer can be exercised without running the extension.
//   node scripts/make-sample.mjs  ->  ./sample-recording.zip
import JSZip from "jszip";
import { writeFile } from "node:fs/promises";

const DURATION = 24_000;
const startEpoch = 1_700_000_000_000;

const consoleEvents = [];
for (let i = 0; i < 60; i++) {
  const offsetMs = Math.round((i / 60) * DURATION);
  const level = i % 13 === 0 ? "error" : i % 7 === 0 ? "warn" : i % 5 === 0 ? "info" : "log";
  consoleEvents.push({
    offsetMs,
    level,
    source: level === "error" && i % 26 === 0 ? "exception" : "console",
    args: [`log #${i}`, { __type: "object", preview: `{ i: ${i} }` }],
    text: `log #${i} — ${level} message at ${offsetMs}ms`,
    stackTrace:
      level === "error"
        ? [{ fn: "doThing", url: "https://example.com/app.js", line: 42, col: 7 }]
        : undefined,
  });
}

const bodies = [];
const network = [];
for (let i = 0; i < 18; i++) {
  const start = Math.round((i / 18) * DURATION);
  const dur = 80 + (i % 5) * 60;
  const failed = i % 9 === 4;
  const reqId = `req-${i}`;
  const respBody = JSON.stringify({ id: i, ok: !failed, items: [i, i + 1, i + 2] });
  const path = `bodies/${reqId}.json`;
  if (!failed) bodies.push({ path, base64: false, data: respBody });
  network.push({
    requestId: reqId,
    offsetMs: start,
    request: {
      method: i % 4 === 0 ? "POST" : "GET",
      url: `https://api.example.com/v1/resource/${i}?q=test`,
      headers: { accept: "application/json", "x-client": "qa" },
      resourceType: "Fetch",
      body:
        i % 4 === 0
          ? { path: null, mimeType: "application/json", size: 0, truncated: false, base64: false }
          : null,
    },
    response: failed
      ? null
      : {
          status: i % 11 === 3 ? 500 : i % 6 === 2 ? 404 : 200,
          statusText: "OK",
          headers: { "content-type": "application/json", "content-length": String(respBody.length) },
          mimeType: "application/json",
          remoteIPAddress: "93.184.216.34",
          fromCache: false,
          body: { path, mimeType: "application/json", size: respBody.length, truncated: false, base64: false },
        },
    timing: {
      startOffsetMs: start,
      endOffsetMs: start + dur,
      durationMs: dur,
    },
    status: failed ? "failed" : "finished",
    errorText: failed ? "net::ERR_CONNECTION_REFUSED" : null,
  });
}

const storageStart = {
  offsetMs: 0,
  origin: "https://example.com",
  localStorage: { theme: "light", token: "abc123", visits: "1" },
  sessionStorage: { step: "intro" },
  cookies: [
    { name: "sid", value: "old-session", domain: "example.com", path: "/", expires: 0, httpOnly: true, secure: true, sameSite: "lax" },
  ],
  indexedDB: { appdb: { prefs: [{ key: "lang", value: "en" }] } },
};

const storageEnd = {
  offsetMs: DURATION,
  origin: "https://example.com",
  localStorage: { theme: "dark", token: "abc123", visits: "2", lastError: "timeout" },
  sessionStorage: {},
  cookies: [
    { name: "sid", value: "new-session", domain: "example.com", path: "/", expires: 0, httpOnly: true, secure: true, sameSite: "lax" },
  ],
  indexedDB: { appdb: { prefs: [{ key: "lang", value: "en" }, { key: "theme", value: "dark" }] } },
};

const manifest = {
  formatVersion: 1,
  recordingStartEpochMs: startEpoch,
  recordingEndEpochMs: startEpoch + DURATION,
  durationMs: DURATION,
  videoStartOffsetMs: 0,
  videoMissing: true,
  page: {
    url: "https://example.com/checkout?step=2",
    title: "Example — Checkout",
    userAgent: "Mozilla/5.0 (sample)",
    viewport: { w: 1440, h: 900 },
  },
  counts: { console: consoleEvents.length, network: network.length },
  bodyCapBytes: 5 * 1024 * 1024,
};

const zip = new JSZip();
zip.file("manifest.json", JSON.stringify(manifest, null, 2));
zip.file("console.json", JSON.stringify(consoleEvents));
zip.file("network.json", JSON.stringify(network));
zip.file("storage/snapshot-start.json", JSON.stringify(storageStart, null, 2));
zip.file("storage/snapshot-end.json", JSON.stringify(storageEnd, null, 2));
for (const b of bodies) zip.file(b.path, b.data, { base64: b.base64 });

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
await writeFile("sample-recording.zip", buf);
console.log(`Wrote sample-recording.zip (${buf.length} bytes) — drag it into the viewer.`);
