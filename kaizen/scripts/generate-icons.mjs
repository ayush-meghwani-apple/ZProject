// Generates PWA PNG icons with no external dependencies (pure PNG encoder).
// Draws a dark rounded square with a centered accent circle and a "₹"-ish mark.
// Run: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function makePng(size) {
  const bg = hex('#0f172a');
  const accent = hex('#0ea5e9');
  const ink = hex('#04222f');
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;
  const radius = size * 0.22; // rounded corners

  // bar mark approximating "₹": two horizontal strokes + a stem
  const stroke = size * 0.05;

  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // rounded-corner background mask
      let inSquare = true;
      const dxC = x < radius ? radius - x : x > size - radius ? x - (size - radius) : 0;
      const dyC = y < radius ? radius - y : y > size - radius ? y - (size - radius) : 0;
      if (dxC > 0 && dyC > 0 && dxC * dxC + dyC * dyC > radius * radius) inSquare = false;

      let col = inSquare ? bg : null;
      if (inSquare) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) {
          col = accent;
          // draw simple ₹ glyph in ink
          const gx = x - (cx - r * 0.45);
          const gy = y - (cy - r * 0.5);
          const w = r * 0.9;
          const h = r;
          const top = gy >= 0 && gy <= stroke && gx >= 0 && gx <= w;
          const mid = gy >= h * 0.32 && gy <= h * 0.32 + stroke && gx >= 0 && gx <= w;
          const stem = gx >= 0 && gx <= stroke && gy >= 0 && gy <= h * 0.55;
          const diag =
            gx >= 0 &&
            gx <= w &&
            gy >= h * 0.32 &&
            gy <= h &&
            Math.abs((gx - 0) - (gy - h * 0.32) * 0.6) <= stroke;
          if (top || mid || stem || diag) col = ink;
        }
      }

      if (col) {
        raw[p++] = col[0];
        raw[p++] = col[1];
        raw[p++] = col[2];
        raw[p++] = 255;
      } else {
        raw[p++] = 0;
        raw[p++] = 0;
        raw[p++] = 0;
        raw[p++] = 0;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(outDir, name), makePng(size));
  console.log('wrote', name);
}
