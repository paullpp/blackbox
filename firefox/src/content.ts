// Injected into the recorded tab. Injects the MAIN-world capture script,
// relays its events to the background, and answers storage-snapshot requests.
import type { PageEnvelope, PageStorageReply, RuntimeMessage } from "./messages";

(() => {
  // Guard against double-injection (re-running adds duplicate listeners).
  if (document.documentElement.dataset.bbContent) return;
  document.documentElement.dataset.bbContent = "1";

  // Inject the page-context capture script.
  const s = document.createElement("script");
  s.src = browser.runtime.getURL("page-capture.js");
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
  s.remove();

  // Relay page-capture events to the background.
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const data = e.data as PageEnvelope | undefined;
    if (!data || data.__blackbox !== true) return;
    void browser.runtime.sendMessage({ type: "CAPTURE_EVENT", event: data.event });
  });

  // Answer storage snapshot requests.
  browser.runtime.onMessage.addListener((msg: RuntimeMessage) => {
    if (msg?.type === "SNAPSHOT_STORAGE") return readStorage();
    return undefined;
  });

  function dumpKV(store: Storage): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k != null) out[k] = store.getItem(k) ?? "";
    }
    return out;
  }

  async function dumpIndexedDB(): Promise<Record<string, Record<string, unknown[]>>> {
    const out: Record<string, Record<string, unknown[]>> = {};
    if (typeof indexedDB === "undefined" || !indexedDB.databases) return out;
    const dbs = await indexedDB.databases();
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
      out[name] = {};
      for (const storeName of Array.from(db.objectStoreNames)) {
        try {
          const rows = await new Promise<unknown[]>((res) => {
            const r = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
            r.onsuccess = () => res(r.result as unknown[]);
            r.onerror = () => res([]);
          });
          try {
            out[name][storeName] = JSON.parse(JSON.stringify(rows));
          } catch {
            out[name][storeName] = [];
          }
        } catch {
          out[name][storeName] = [];
        }
      }
      db.close();
    }
    return out;
  }

  async function readStorage(): Promise<PageStorageReply> {
    const reply: PageStorageReply = {
      origin: location.origin,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      localStorage: {},
      sessionStorage: {},
    };
    try {
      reply.localStorage = dumpKV(window.localStorage);
    } catch {
      /* blocked */
    }
    try {
      reply.sessionStorage = dumpKV(window.sessionStorage);
    } catch {
      /* blocked */
    }
    try {
      reply.indexedDB = await dumpIndexedDB();
    } catch (e) {
      reply.indexedDBError = String(e);
    }
    return reply;
  }
})();
