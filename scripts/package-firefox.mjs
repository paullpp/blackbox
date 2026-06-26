// Zips firefox/dist into a distributable archive — for temporary "Load Add-on"
// testing and for addons.mozilla.org (AMO) submission.
//   node scripts/package-firefox.mjs  ->  ./blackbox-firefox-v<version>.zip
import JSZip from "jszip";
import { readFile, readdir, writeFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const distDir = join(root, "firefox", "dist");

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
  console.error("firefox/dist not found — run `npm run build:firefox` first.");
  process.exit(1);
}

const version = JSON.parse(
  await readFile(join(root, "firefox", "manifest.json"), "utf8"),
).version;

const files = await walk(distDir);
const zip = new JSZip();
for (const file of files) {
  zip.file(relative(distDir, file), await readFile(file));
}

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
const outName = `blackbox-firefox-v${version}.zip`;
await writeFile(join(root, outName), buf);
console.log(`Wrote ${outName} (${files.length} files, ${(buf.length / 1024).toFixed(1)} KB)`);
console.log("→ Test: about:debugging → This Firefox → Load Temporary Add-on → pick manifest.json in firefox/dist");
console.log("→ Publish: upload this zip at https://addons.mozilla.org/developers/");
