import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconDirectory = path.join(projectRoot, "assets", "icons");
const sizes = [16, 24, 32, 48, 64, 128, 256];
const tools = ["merge", "organize", "split"];

function createIco(images) {
  const directorySize = 6 + images.length * 16;
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = directorySize;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

await fs.mkdir(iconDirectory, { recursive: true });
for (const tool of tools) {
  const image = await loadImage(path.join(iconDirectory, `${tool}.svg`));
  const images = sizes.map((size) => {
    const canvas = createCanvas(size, size);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, size, size);
    return { size, png: canvas.toBuffer("image/png") };
  });
  await fs.writeFile(path.join(iconDirectory, `${tool}.ico`), createIco(images));
}
