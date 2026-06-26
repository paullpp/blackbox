// Rasterizes extension/icons/icon.svg into the PNG sizes Chrome needs.
//   node scripts/make-icons.mjs
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const iconsDir = join(root, "extension", "icons");
const svg = await readFile(join(iconsDir, "icon.svg"));

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await writeFile(join(iconsDir, `icon-${size}.png`), png);
  console.log(`wrote icons/icon-${size}.png`);
}
