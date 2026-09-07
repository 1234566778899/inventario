// Regenerates the favicon / touch-icon / logo assets in public/ from logo.png
// (the brand wordmark at the project root). Needs Python 3 with Pillow.
// The white backdrop of the source image is knocked out to transparency.
const { execFileSync } = require('child_process');
const { resolve } = require('path');
const { existsSync } = require('fs');

const root = resolve(__dirname, '..');
const src = resolve(root, 'logo.png');
const pub = resolve(root, 'public');

if (!existsSync(src)) {
  console.error(`✗  ${src} not found`);
  process.exit(1);
}

const py = `
import sys
from PIL import Image

src, pub = sys.argv[1], sys.argv[2]
base = Image.open(src).convert("RGB")
w, h = base.size
px = base.load()

def is_ink(c):
    return (c[0] + c[1] + c[2]) < 600  # not near-white

# ---- Knock the white backdrop out to transparency ----
# alpha ramps 0 (>=250 bright) -> 255 (<=235 bright) so anti-aliased edges survive.
rgba = base.convert("RGBA")
out = rgba.load()
for y in range(h):
    for x in range(w):
        r, g, b, _ = out[x, y]
        bright = max(r, g, b)
        if bright >= 250:
            a = 0
        elif bright <= 235:
            a = 255
        else:
            a = round((250 - bright) / 15 * 255)
        out[x, y] = (r, g, b, a)

# ---- Full wordmark (login + sidebar), width-capped ----
full = rgba
if full.width > 1000:
    full = full.resize((1000, round(1000 * h / w)), Image.LANCZOS)
full.save(f"{pub}/logo.png", optimize=True)

# ---- Isolate the standalone "J" mark for the square icon ----
col_has_ink = [any(is_ink(px[x, y]) for y in range(0, h, 2)) for x in range(w)]
runs, s = [], None
for x in range(w):
    if col_has_ink[x] and s is None:
        s = x
    elif not col_has_ink[x] and s is not None:
        runs.append((s, x - 1)); s = None
if s is not None:
    runs.append((s, w - 1))

start, end = runs[0]
limit = (end + runs[1][0]) // 2 if len(runs) > 1 else w  # never bleed into next glyph
rows = [y for y in range(h) if any(is_ink(px[x, y]) for x in range(start, end + 1))]
top, bot = min(rows), max(rows)

pad = round(max(end - start, bot - top) * 0.12)
box = (max(start - pad, 0), max(top - pad, 0),
       min(end + pad + 1, limit), min(bot + pad + 1, h))
mark = rgba.crop(box)

# Center on a square transparent canvas
side = max(mark.size)
canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
canvas.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2), mark)

canvas.resize((512, 512), Image.LANCZOS).save(f"{pub}/favicon.png", optimize=True)
canvas.resize((180, 180), Image.LANCZOS).save(f"{pub}/apple-touch-icon.png", optimize=True)
canvas.resize((256, 256), Image.LANCZOS).save(
    f"{pub}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (256, 256)])
print("ok")
`;

execFileSync('python3', ['-c', py, src, pub], { stdio: 'inherit' });
console.log('✅  Regenerated favicon / logo assets in public/ from logo.png');
