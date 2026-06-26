import type { CookieRecord, StorageSnapshot } from "@shared/format";

/**
 * Runs in the *page* context via chrome.scripting.executeScript. Returns a
 * JSON-serializable snapshot of web storage + best-effort IndexedDB.
 */
async function readPageStorage(): Promise<{
  origin: string;
  viewport: { w: number; h: number };
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  indexedDB?: Record<string, Record<string, unknown[]>>;
  indexedDBError?: string;
}> {
  const dumpKV = (s: Storage): Record<string, string> => {
    const out: Record<string, string> = {};
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k != null) out[k] = s.getItem(k) ?? "";
    }
    return out;
  };

  const result: {
    origin: string;
    viewport: { w: number; h: number };
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
    indexedDB?: Record<string, Record<string, unknown[]>>;
    indexedDBError?: string;
  } = {
    origin: location.origin,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    localStorage: {},
    sessionStorage: {},
  };

  try {
    result.localStorage = dumpKV(window.localStorage);
  } catch {
    /* storage may be blocked */
  }
  try {
    result.sessionStorage = dumpKV(window.sessionStorage);
  } catch {
    /* ignore */
  }

  // Best-effort IndexedDB dump.
  try {
    if (typeof indexedDB === "undefined" || !indexedDB.databases) {
      result.indexedDBError = "indexedDB.databases() unavailable";
    } else {
      const dbs = await indexedDB.databases();
      const idbOut: Record<string, Record<string, unknown[]>> = {};
      for (const info of dbs) {
        const name = info.name;
        if (!name) continue;
        const db = await new Promise<IDBDatabase | null>((res) => {
          const req = indexedDB.open(name);
          req.onsuccess = () => res(req.result);
          req.onerror = () => res(null);
          req.onblocked = () => res(null);
        });
        if (!db) continue;
        idbOut[name] = {};
        for (const storeName of Array.from(db.objectStoreNames)) {
          try {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const rows = await new Promise<unknown[]>((res) => {
              const r = store.getAll();
              r.onsuccess = () => res(r.result as unknown[]);
              r.onerror = () => res([]);
            });
            // Drop anything not JSON-serializable (Blobs, etc.).
            try {
              idbOut[name][storeName] = JSON.parse(JSON.stringify(rows));
            } catch {
              idbOut[name][storeName] = [];
            }
          } catch {
            idbOut[name][storeName] = [];
          }
        }
        db.close();
      }
      result.indexedDB = idbOut;
    }
  } catch (e) {
    result.indexedDBError = String(e);
  }

  return result;
}

/** Capture a full storage snapshot for the given tab. */
export async function captureStorage(
  tabId: number,
  tabUrl: string | undefined,
  offsetMs: number,
): Promise<StorageSnapshot> {
  const snapshot: StorageSnapshot = {
    offsetMs,
    origin: tabUrl ?? "",
    localStorage: {},
    sessionStorage: {},
    cookies: [],
  };

  // Web storage + IndexedDB from the page.
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: readPageStorage,
      world: "MAIN",
    });
    const r = injection?.result as Awaited<ReturnType<typeof readPageStorage>> | undefined;
    if (r) {
      snapshot.origin = r.origin || snapshot.origin;
      snapshot.localStorage = r.localStorage;
      snapshot.sessionStorage = r.sessionStorage;
      if (r.indexedDB) snapshot.indexedDB = r.indexedDB;
      if (r.indexedDBError) snapshot.indexedDBError = r.indexedDBError;
    }
  } catch (e) {
    snapshot.indexedDBError = `executeScript failed: ${String(e)}`;
  }

  // Cookies via the privileged API (captures HttpOnly cookies too).
  try {
    if (tabUrl && /^https?:/.test(tabUrl)) {
      const cookies = await chrome.cookies.getAll({ url: tabUrl });
      snapshot.cookies = cookies.map(
        (c): CookieRecord => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expirationDate ?? 0,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite ?? "unspecified",
        }),
      );
    }
  } catch {
    /* cookies may be unavailable */
  }

  return snapshot;
}

/** Read just the viewport for the manifest (cheap, MAIN world). */
export async function readViewport(
  tabId: number,
): Promise<{ w: number; h: number }> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ w: window.innerWidth, h: window.innerHeight }),
      world: "MAIN",
    });
    return (injection?.result as { w: number; h: number }) ?? { w: 0, h: 0 };
  } catch {
    return { w: 0, h: 0 };
  }
}
