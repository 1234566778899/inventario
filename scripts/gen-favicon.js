// Generates public/favicon.ico from scratch (no external deps).
// A 32x32 32-bit ARGB icon: rounded blue tile with a white "F" for Ferretería.
const { writeFileSync } = require('fs');
const { resolve } = require('path');

const SIZE = 32;
const BG = [0xDF, 0x67, 0x0C, 0xFF]; // #0C67DF in BGRA
const FG = [0xFF, 0xFF, 0xFF, 0xFF]; // white
const TR = [0x00, 0x00, 0x00, 0x00]; // transparent

// Corner radius (px)
const R = 6;

// Build a rounded-square mask + letter "F"
function pixelAt(x, y) {
  // Rounded corners — check which corner (if any) the pixel is in
  const inTL = x < R && y < R;
  const inTR = x >= SIZE - R && y < R;
  const inBL = x < R && y >= SIZE - R;
  const inBR = x >= SIZE - R && y >= SIZE - R;

  if (inTL || inTR || inBL || inBR) {
    const cx = inTL || inBL ? R - 1 : SIZE - R;
    const cy = inTL || inTR ? R - 1 : SIZE - R;
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy > R * R) return TR;
  }

  // Letter "F" — 3 white rectangles
  // Vertical stem
  if (x >= 10 && x <= 13 && y >= 7 && y <= 25) return FG;
  // Top horizontal
  if (x >= 10 && x <= 23 && y >= 7 && y <= 10) return FG;
  // Middle horizontal
  if (x >= 10 && x <= 20 && y >= 14 && y <= 17) return FG;

  return BG;
}

// Build the pixel grid (top-down)
const grid = [];
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    grid.push(pixelAt(x, y));
  }
}

// ── XOR (color) data: bottom-up BGRA ────────────────────────────────────────
const xorData = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const src = (SIZE - 1 - y) * SIZE + x;
    const dst = (y * SIZE + x) * 4;
    const p = grid[src];
    xorData[dst + 0] = p[0]; // B
    xorData[dst + 1] = p[1]; // G
    xorData[dst + 2] = p[2]; // R
    xorData[dst + 3] = p[3]; // A
  }
}

// ── AND (transparency) mask: 1 bit per pixel, bottom-up ─────────────────────
const andRowBytes = SIZE / 8;
const andData = Buffer.alloc(SIZE * andRowBytes);
for (let y = 0; y < SIZE; y++) {
  for (let xb = 0; xb < andRowBytes; xb++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      const x = xb * 8 + b;
      const src = (SIZE - 1 - y) * SIZE + x;
      // 1 = transparent, 0 = opaque
      if (grid[src][3] === 0) byte |= 1 << (7 - b);
    }
    andData[y * andRowBytes + xb] = byte;
  }
}

// ── BITMAPINFOHEADER (40 bytes) ─────────────────────────────────────────────
const dib = Buffer.alloc(40);
dib.writeUInt32LE(40, 0);          // header size
dib.writeInt32LE(SIZE, 4);         // width
dib.writeInt32LE(SIZE * 2, 8);     // height (XOR + AND stacked)
dib.writeUInt16LE(1, 12);          // planes
dib.writeUInt16LE(32, 14);         // bits per pixel
// remaining fields left at 0

const imageData = Buffer.concat([dib, xorData, andData]);

// ── ICONDIR (6 bytes) ───────────────────────────────────────────────────────
const iconDir = Buffer.alloc(6);
iconDir.writeUInt16LE(0, 0);       // reserved
iconDir.writeUInt16LE(1, 2);       // type = icon
iconDir.writeUInt16LE(1, 4);       // image count

// ── ICONDIRENTRY (16 bytes) ─────────────────────────────────────────────────
const entry = Buffer.alloc(16);
entry.writeUInt8(SIZE, 0);              // width
entry.writeUInt8(SIZE, 1);              // height
entry.writeUInt8(0, 2);                 // colors in palette
entry.writeUInt8(0, 3);                 // reserved
entry.writeUInt16LE(1, 4);              // planes
entry.writeUInt16LE(32, 6);             // bit count
entry.writeUInt32LE(imageData.length, 8); // size of image data
entry.writeUInt32LE(6 + 16, 12);        // offset

const ico = Buffer.concat([iconDir, entry, imageData]);
const out = resolve(__dirname, '../public/favicon.ico');
writeFileSync(out, ico);
console.log(`✅  Wrote ${out} (${ico.length} bytes)`);
