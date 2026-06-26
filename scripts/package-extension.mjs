// Zips extension/dist into a versioned, distributable archive — usable for
// "Load unpacked" sharing AND for uploading to the Chrome Web Store.
//   node scripts/package-extension.mjs  ->  ./blackbox-extension-v<version>.zip
import JSZip from "jszip";
import { readFile, readdir, writeFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const distDir = join(root, "extension", "dist");

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

try {
  await stat(distDir);
} catch {
  console.error("extension/dist not found — run `npm run build:extension` first.");
  process.exit(1);
}

const version = JSON.parse(
  await readFile(join(root, "extension", "package.json"), "utf8"),
).version;

const files = await walk(distDir);
const zip = new JSZip();
for (const file of files) {
  // Zip paths are relative to dist/, so the archive unpacks to a flat extension.
  zip.file(relative(distDir, file), await readFile(file));
}

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
const outName = `blackbox-extension-v${version}.zip`;
await writeFile(join(root, outName), buf);
console.log(`Wrote ${outName} (${files.length} files, ${(buf.length / 1024).toFixed(1)} KB)`);
console.log("→ Load unpacked: unzip and pick the folder in chrome://extensions");
console.log("→ Chrome Web Store: upload this zip directly in the dev dashboard");
