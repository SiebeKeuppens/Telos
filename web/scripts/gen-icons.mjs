// Rasterize the PWA icons from the source SVG. Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/icons/icon.svg", import.meta.url));

await sharp(svg).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(svg).resize(512, 512).png().toFile("public/icons/icon-512.png");
// Maskable: pad the safe zone (80% content).
await sharp({
  create: { width: 640, height: 640, channels: 4, background: "#0a0f10" },
})
  .composite([{ input: await sharp(svg).resize(512, 512).png().toBuffer() }])
  .resize(512, 512)
  .png()
  .toFile("public/icons/icon-512-maskable.png");

console.log("icons generated");
