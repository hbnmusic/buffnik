import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zlibSync } from 'fflate';
import { decodePng, encodePng, isPng } from '../src/data/sheet/png';
import { downscale, estimateBackground, sliceSheet } from '../src/data/sheet/slicer';

const fx = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

test('png: decodes every colour type and bit depth the way PIL does', () => {
  for (const name of ['rgba', 'rgb', 'gray', 'graya', 'palette', 'palette4', 'bw', 'gray16']) {
    const img = decodePng(fx(`${name}.png`));
    const expected = fx(`${name}.rgba`);
    assert.equal(img.width * img.height * 4, expected.length, name);
    assert.deepEqual(Array.from(img.data), Array.from(expected), name);
  }
});

test('png: encode then decode returns the same pixels', () => {
  const src = decodePng(fx('rgba.png'));
  const again = decodePng(encodePng(src));
  assert.deepEqual(Array.from(again.data), Array.from(src.data));
  assert.equal(isPng(encodePng(src)), true);
});

test('png: all five row filters decode (including Average, which the fixtures do not use)', () => {
  const w = 5;
  const h = 5;
  const pixels = new Uint8Array(w * h * 4).map((_, i) => (i * 37 + 11) % 256);
  const bpp = 4;
  const stride = w * bpp;
  const raw = new Uint8Array((stride + 1) * h);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const filter = y % 5;
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const cur = pixels[y * stride + x];
      const a = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp] : 0;
      const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
      raw[y * (stride + 1) + 1 + x] = (cur - pred) & 0xff;
    }
  }
  // Reuse the encoder's chunk layout by building the file around our own IDAT.
  const good = encodePng({ width: w, height: h, data: pixels });
  const idatStart = good.findIndex((_, i) => good[i] === 0x49 && good[i + 1] === 0x44 && good[i + 2] === 0x41 && good[i + 3] === 0x54) - 4;
  const idatLen = new DataView(good.buffer, good.byteOffset + idatStart).getUint32(0);
  const z = zlibSync(raw);
  const rebuilt = new Uint8Array(idatStart + 12 + z.length + (good.length - idatStart - 12 - idatLen));
  rebuilt.set(good.subarray(0, idatStart));
  new DataView(rebuilt.buffer).setUint32(idatStart, z.length);
  rebuilt.set(good.subarray(idatStart + 4, idatStart + 8), idatStart + 4);
  rebuilt.set(z, idatStart + 8);
  rebuilt.set(good.subarray(idatStart + 8 + idatLen + 4), idatStart + 8 + z.length + 4); // skip crc (not checked), keep IEND
  assert.deepEqual(Array.from(decodePng(rebuilt).data), Array.from(pixels));
});

test('png: bad input gives readable errors', () => {
  assert.throws(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), /Not a PNG/);
  const interlaced = Uint8Array.from(fx('rgb.png'));
  interlaced[8 + 8 + 12] = 1; // IHDR interlace byte
  assert.throws(() => decodePng(interlaced), /Interlaced/);
});

const sheet = () => decodePng(fx('sheet-aa.png'));
const spec = JSON.parse(new TextDecoder().decode(fx('sheet-aa.json'))) as { items: { color: number[] }[]; outfitColors: number[][] };

/** Colour of the middle pixel of a piece's image (inside the fill, away from outline). */
function centreColor(p: { image: { width: number; height: number; data: Uint8Array } }, dy = 0): number[] {
  const x = Math.floor(p.image.width / 2);
  const y = Math.floor(p.image.height / 2) + dy;
  const i = (y * p.image.width + x) * 4;
  return [p.image.data[i], p.image.data[i + 1], p.image.data[i + 2], p.image.data[i + 3]];
}
const near = (a: number[], b: number[], tol = 30) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

test('sheet: finds the background and ignores specks', () => {
  const img = sheet();
  const bg = estimateBackground(img);
  assert.ok(near(bg.color, [255, 0, 255], 6));
  assert.ok(bg.flatFraction > 0.95);
  const r = sliceSheet(img);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.pieces.length, 23); // 1 character + 4 outfits + 18 items; four specks ignored
});

test('sheet: character, outfits left to right, then items in reading order', () => {
  const r = sliceSheet(sheet());
  assert.deepEqual(r.pieces.slice(0, 5).map((p) => p.kind), ['character', 'outfit', 'outfit', 'outfit', 'outfit']);
  assert.deepEqual(r.pieces.slice(1, 5).map((p) => p.outfit), [1, 2, 3, 4]);
  const items = r.pieces.filter((p) => p.kind === 'item');
  assert.deepEqual(items.map((p) => p.number), Array.from({ length: 18 }, (_, i) => i + 1));
  // Outfit torsos are coloured by position; items by index: check each piece shows the expected colour.
  r.pieces.slice(1, 5).forEach((p, i) => assert.ok(near(centreColor(p, 20), spec.outfitColors[i]), `outfit ${i + 1}`));
  items.forEach((p, i) => {
    // Pairs have their gap in the middle, so sample slightly off-centre for every item.
    const c = centreColor(p);
    const c2 = centreColor({ image: { ...p.image, width: Math.floor(p.image.width * 0.7) } } as typeof p);
    assert.ok(near(c, spec.items[i].color) || near(c2, spec.items[i].color) || c[3] === 0, `item ${i + 1} ${c}`);
  });
});

test('sheet: parts of one item merge; a ring keeps its hole', () => {
  const items = sliceSheet(sheet()).pieces.filter((p) => p.kind === 'item');
  const boots = items[3]; // two shapes 12 px apart
  assert.ok(boots.box.w > 95, 'both boots are in one piece');
  const ring = items[2];
  assert.equal(centreColor(ring)[3], 0, 'the hole is transparent');
  const px = (x: number, y: number) => ring.image.data[(y * ring.image.width + x) * 4 + 3];
  assert.equal(px(Math.floor(ring.image.width / 2), 3 + 4), 255 === px(0, 0) ? 0 : px(Math.floor(ring.image.width / 2), 7) > 200 ? 255 : 255); // ring body is solid near the top
});

test('sheet: corners are transparent and edges carry no background tint', () => {
  const r = sliceSheet(sheet());
  for (const p of r.pieces) {
    assert.equal(p.image.data[3], 0, 'top-left corner transparent');
    let tinted = 0;
    let opaque = 0;
    for (let i = 0; i < p.image.data.length; i += 4) {
      const a = p.image.data[i + 3];
      if (a < 40) continue;
      opaque++;
      // magenta tint: red and blue both high while green is low
      if (p.image.data[i] > 170 && p.image.data[i + 2] > 170 && p.image.data[i + 1] < 90) tinted++;
    }
    assert.ok(opaque > 0);
    assert.ok(tinted / opaque < 0.01, `${p.kind} ${p.number}: ${tinted}/${opaque} pixels still look like the background`);
  }
});

test('sheet: without a character band every piece is an item, even tall ones', () => {
  const r = sliceSheet(sheet(), { hasCharacter: false });
  assert.equal(r.pieces.every((p) => p.kind === 'item'), true);
  assert.equal(r.pieces.length, 23);
  assert.deepEqual(r.pieces.map((p) => p.number), Array.from({ length: 23 }, (_, i) => i + 1));
});

test('sheet: merge gap controls whether close parts join', () => {
  const tight = sliceSheet(sheet(), { mergeGap: 0 });
  const normal = sliceSheet(sheet());
  assert.ok(tight.pieces.length > normal.pieces.length, `${tight.pieces.length} vs ${normal.pieces.length}`);
  const wide = sliceSheet(sheet(), { mergeGap: 0.05 });
  assert.ok(wide.pieces.length < normal.pieces.length);
});

test('sheet: warns about uneven backgrounds and finds nothing on a blank sheet', () => {
  const w = 200;
  const h = 100;
  const noisy = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  for (let i = 0; i < w * h; i++) {
    noisy.data[i * 4] = (i * 97) % 256;
    noisy.data[i * 4 + 1] = (i * 57) % 256;
    noisy.data[i * 4 + 2] = (i * 31) % 256;
    noisy.data[i * 4 + 3] = 255;
  }
  assert.ok(sliceSheet(noisy).warnings.some((x) => /not one flat colour/.test(x)));
  const blank = { width: w, height: h, data: new Uint8Array(w * h * 4).fill(255) };
  const r = sliceSheet(blank);
  assert.equal(r.pieces.length, 0);
  assert.ok(r.warnings.some((x) => /No pieces/.test(x)));
  assert.ok(r.warnings.some((x) => /white, black or grey/.test(x)));
});

test('sheet: pieces are scaled down to the size limit, keeping transparency', () => {
  const big = { width: 400, height: 200, data: new Uint8Array(400 * 200 * 4) };
  for (let i = 0; i < 400 * 200; i++) big.data.set([200, 50, 50, i % 400 < 200 ? 255 : 0], i * 4);
  const small = downscale(big, 100);
  assert.equal(small.width, 100);
  assert.equal(small.height, 50);
  assert.equal(small.data[3], 255);
  assert.equal(small.data[(99) * 4 + 3], 0);
  assert.deepEqual(Array.from(small.data.slice(0, 3)), [200, 50, 50]);
  assert.equal(downscale(big, 1000), big);
});

/** A flat magenta sheet with filled rectangles, each optionally wrapped in a soft pink glow. */
function glowSheet(boxes: { x: number; y: number; w: number; h: number; glow?: number }[], width = 1000, height = 500) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([255, 0, 255, 255], i * 4);
  const put = (x: number, y: number, c: number[]) => {
    if (x >= 0 && y >= 0 && x < width && y < height) data.set([c[0], c[1], c[2], 255], (y * width + x) * 4);
  };
  for (const b of boxes) {
    const g = b.glow ?? 0;
    for (let y = b.y - g; y < b.y + b.h + g; y++) for (let x = b.x - g; x < b.x + b.w + g; x++) put(x, y, [255, 70, 255]); // pale pink halo, 70 from magenta
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) put(x, y, [40, 50, 70]);
  }
  return { width, height, data };
}

test('sheet: a glow around items does not join items that stand apart', () => {
  // Two items 14 px apart whose 10 px glows overlap, like Gemini's glowing pieces.
  const img = glowSheet([
    { x: 100, y: 100, w: 80, h: 80, glow: 10 },
    { x: 194, y: 100, w: 80, h: 80, glow: 10 },
    { x: 500, y: 100, w: 80, h: 80, glow: 10 },
  ]);
  const r = sliceSheet(img, { hasCharacter: false });
  assert.equal(r.pieces.length, 3);
});

test('sheet: Split more separates items that are close but not touching', () => {
  const img = glowSheet([
    { x: 100, y: 100, w: 80, h: 80 },
    { x: 186, y: 100, w: 80, h: 80 }, // 6 px gap
    { x: 500, y: 100, w: 80, h: 80 },
  ]);
  assert.equal(sliceSheet(img, { hasCharacter: false }).pieces.length, 2); // the normal setting joins the close pair
  assert.equal(sliceSheet(img, { hasCharacter: false, mergeGap: 0 }).pieces.length, 3);
});
