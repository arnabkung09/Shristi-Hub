import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

const CRC_TABLE = createCRC32Table();

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function writePNG(width, height, getPixel) {
  // Raw scanlines: each scanline starts with filter byte 0
  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(rowBytes * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA (6)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  typeBuf.copy(chunk, 4);
  data.copy(chunk, 8);

  const crcTarget = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcTarget);
  chunk.writeUInt32BE(crcVal, 8 + len);
  return chunk;
}

// Draw Academy Shield & Emblem
function renderAcademyIcon(x, y, w, h, maskable = false) {
  const cx = w / 2;
  const cy = h / 2;
  const nx = (x - cx) / (w / 2);
  const ny = (y - cy) / (h / 2);
  const dist = Math.sqrt(nx * nx + ny * ny);

  // Base background: Dark navy (#0f172a)
  let r = 15, g = 23, b = 42, a = 255;

  const scale = maskable ? 0.65 : 0.85;
  const sx = nx / scale;
  const sy = ny / scale;

  // Shield boundary calculation
  // Top: straight-ish or slight arc; Sides: vertical then tapering to bottom tip
  const insideShield = (
    sy >= -0.75 &&
    sy <= 0.85 &&
    Math.abs(sx) <= 0.75 &&
    (sy <= 0.1 || (Math.abs(sx) <= 0.75 * (1 - Math.pow((sy - 0.1) / 0.75, 1.5))))
  );

  if (insideShield) {
    // Royal Indigo / Purple gradient (#6366f1 to #4338ca)
    const t = (sy + 0.75) / 1.6;
    r = Math.round(99 * (1 - t) + 67 * t);
    g = Math.round(102 * (1 - t) + 56 * t);
    b = Math.round(241 * (1 - t) + 202 * t);

    // Inner gold/white "S" emblem for Shristi Academy
    const isS = (
      // Top horizontal bar of S
      (sy >= -0.45 && sy <= -0.32 && sx >= -0.32 && sx <= 0.32) ||
      // Top-left vertical
      (sy >= -0.35 && sy <= -0.05 && sx >= -0.32 && sx <= -0.16) ||
      // Middle horizontal
      (sy >= -0.10 && sy <= 0.04 && sx >= -0.28 && sx <= 0.28) ||
      // Bottom-right vertical
      (sy >= 0.02 && sy <= 0.35 && sx >= 0.16 && sx <= 0.32) ||
      // Bottom horizontal
      (sy >= 0.32 && sy <= 0.45 && sx >= -0.32 && sx <= 0.32)
    );

    if (isS) {
      r = 255;
      g = 255;
      b = 255;
    }
  }

  // Rounded outer corners if not maskable
  if (!maskable && dist > 0.98) {
    a = Math.max(0, Math.min(255, Math.round((1 - (dist - 0.98) / 0.02) * 255)));
  }

  return [r, g, b, a];
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate PWA Icons
console.log('Generating pwa-192x192.png...');
const icon192 = writePNG(192, 192, (x, y, w, h) => renderAcademyIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), icon192);

console.log('Generating pwa-512x512.png...');
const icon512 = writePNG(512, 512, (x, y, w, h) => renderAcademyIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), icon512);

console.log('Generating pwa-maskable-512x512.png...');
const iconMaskable = writePNG(512, 512, (x, y, w, h) => renderAcademyIcon(x, y, w, h, true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), iconMaskable);

console.log('Generating apple-touch-icon.png (180x180)...');
const iconApple = writePNG(180, 180, (x, y, w, h) => renderAcademyIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), iconApple);

console.log('All PWA and mobile touch icons generated successfully!');
