import JSZip from "jszip";
import {
  FILES,
  FORMAT_VERSION,
  type ConsoleEvent,
  type NetworkEntry,
  type ParsedRecording,
  type RecordingManifest,
  type StorageSnapshot,
} from "@shared/format";

async function readJson<T>(zip: JSZip, path: string): Promise<T | null> {
  const file = zip.file(path);
  if (!file) return null;
  const text = await file.async("string");
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Read a recording zip (File/Blob) into the structured shape the UI consumes. */
export async function loadRecording(file: Blob): Promise<ParsedRecording> {
  const zip = await JSZip.loadAsync(file);

  const manifest = await readJson<RecordingManifest>(zip, FILES.manifest);
  if (!manifest) {
    throw new Error("Not a valid recording: manifest.json missing or unreadable.");
  }
  if (manifest.formatVersion > FORMAT_VERSION) {
    throw new Error(
      `Recording format v${manifest.formatVersion} is newer than this viewer (v${FORMAT_VERSION}). Please update the viewer.`,
    );
  }

  const [consoleEvents, network, storageStart, storageEnd] = await Promise.all([
    readJson<ConsoleEvent[]>(zip, FILES.console),
    readJson<NetworkEntry[]>(zip, FILES.network),
    readJson<StorageSnapshot>(zip, FILES.storageStart),
    readJson<StorageSnapshot>(zip, FILES.storageEnd),
  ]);

  let videoUrl: string | null = null;
  const videoFile = zip.file(FILES.video);
  if (videoFile && !manifest.videoMissing) {
    const videoBlob = await videoFile.async("blob");
    videoUrl = URL.createObjectURL(
      new Blob([videoBlob], { type: "video/webm" }),
    );
  }

  const bodyCache = new Map<string, Promise<{ text: string | null; blob: Blob }>>();
  const readBody = (path: string) => {
    let p = bodyCache.get(path);
    if (!p) {
      p = (async () => {
        const f = zip.file(path);
        if (!f) return { text: null, blob: new Blob() };
        const [blob, text] = await Promise.all([
          f.async("blob"),
          f.async("string").catch(() => null),
        ]);
        return { text, blob };
      })();
      bodyCache.set(path, p);
    }
    return p;
  };

  const sortByOffset = <T extends { offsetMs: number }>(arr: T[] | null): T[] =>
    (arr ?? []).slice().sort((a, b) => a.offsetMs - b.offsetMs);

  return {
    manifest,
    console: sortByOffset(consoleEvents),
    network: sortByOffset(network),
    storageStart,
    storageEnd,
    videoUrl,
    readBody,
  };
}

/** Release object URLs created for a recording. */
export function disposeRecording(rec: ParsedRecording | null): void {
  if (rec?.videoUrl) URL.revokeObjectURL(rec.videoUrl);
}
