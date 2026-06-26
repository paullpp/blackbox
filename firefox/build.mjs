// Builds the Firefox extension. Content scripts and the event-page background
// must be classic IIFE bundles (no ES module imports at runtime), so we bundle
// each entry with esbuild rather than Vite/CRXJS.
import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "dist");
const shared = resolve(here, "..", "shared");

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "icons"), { recursive: true });

const common = {
  bundle: true,
  format: "iife",
  target: "firefox121",
  logLevel: "info",
  legalComments: "none",
  alias: { "@shared": shared },
};

await esbuild.build({
  ...common,
  entryPoints: [resolve(here, "src/background.ts")],
  outfile: resolve(dist, "background.js"),
});
await esbuild.build({
  ...common,
  entryPoints: [resolve(here, "src/content.ts")],
  outfile: resolve(dist, "content.js"),
});
await esbuild.build({
  ...common,
  entryPoints: [resolve(here, "src/page-capture.ts")],
  outfile: resolve(dist, "page-capture.js"),
});
await esbuild.build({
  ...common,
  entryPoints: [resolve(here, "src/recorder.ts")],
  outfile: resolve(dist, "recorder.js"),
});

// Static assets.
await cp(resolve(here, "manifest.json"), resolve(dist, "manifest.json"));
await cp(resolve(here, "recorder.html"), resolve(dist, "recorder.html"));
for (const size of [16, 32, 48, 128]) {
  await cp(
    resolve(here, "..", "extension", "icons", `icon-${size}.png`),
    resolve(dist, "icons", `icon-${size}.png`),
  );
}

console.log("Firefox extension built -> firefox/dist");
