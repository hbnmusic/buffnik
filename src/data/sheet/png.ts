/** Minimal PNG reader and writer (8-bit and 16-bit, no interlacing), pure TypeScript on top of fflate. */
import { unzlibSync, zlibSync } from 'fflate';

export interface Rgba {
  width: number;
  height: number;
  /** width * height * 4 bytes: R, G, B, A. */
  data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && SIGNATURE.every((b, i) => bytes[i] === b);
}

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(bytes: Uint8Array): Rgba {
  if (!isPng(bytes)) throw new Error('Not a PNG image.');
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];

  let o = 8;
  while (o + 8 <= bytes.length) {
    const len = u32(bytes, o);
    const type = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
    const body = bytes.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      width = u32(body, 0);
      height = u32(body, 4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (!width || !height) throw new Error('The PNG header is missing.');
  if (interlace !== 0) throw new Error('Interlaced PNGs are not supported. Save the image again as a normal PNG.');
  if (![1, 2, 4, 8, 16].includes(depth)) throw new Error(`Unsupported PNG bit depth ${depth}.`);
  if (width * height > 40_000_000) throw new Error('The image is too large to process.');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType as 0 | 2 | 3 | 4 | 6];
  if (!channels) throw new Error(`Unsupported PNG colour type ${colorType}.`);
  const bitsPerPixel = channels * depth;
  const bpp = Math.max(1, bitsPerPixel >> 3); // bytes per pixel for filtering
  const stride = Math.ceil((width * bitsPerPixel) / 8);

  const total = idat.reduce((s, c) => s + c.length, 0);
  const joined = new Uint8Array(total);
  let p = 0;
  for (const c of idat) {
    joined.set(c, p);
    p += c.length;
  }
  const raw = unzlibSync(joined);
  if (raw.length < (stride + 1) * height) throw new Error('The PNG data is incomplete.');

  // Undo the per-row filters in place.
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = dst - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[dst + x - bpp] : 0;
      const b = y > 0 ? rows[prev + x] : 0;
      const c = x >= bpp && y > 0 ? rows[prev + x - bpp] : 0;
      const v = raw[src + x];
      rows[dst + x] = filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b : filter === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c);
    }
  }

  const out = new Uint8Array(width * height * 4);
  const sample = (y: number, i: number): number => {
    // i-th sample of row y, scaled to 0..255 (palette indices stay raw).
    if (depth === 8) return rows[y * stride + i];
    if (depth === 16) return rows[y * stride + i * 2];
    const bit = i * depth;
    const byte = rows[y * stride + (bit >> 3)];
    const v = (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return colorType === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  const trnsGray = trns && colorType === 0 && trns.length >= 2 ? trns[1] : -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      if (colorType === 6) {
        out[d] = sample(y, x * 4);
        out[d + 1] = sample(y, x * 4 + 1);
        out[d + 2] = sample(y, x * 4 + 2);
        out[d + 3] = sample(y, x * 4 + 3);
      } else if (colorType === 2) {
        out[d] = sample(y, x * 3);
        out[d + 1] = sample(y, x * 3 + 1);
        out[d + 2] = sample(y, x * 3 + 2);
        out[d + 3] = 255;
      } else if (colorType === 0) {
        const g = sample(y, x);
        out[d] = out[d + 1] = out[d + 2] = g;
        out[d + 3] = g === trnsGray && depth === 8 ? 0 : 255;
      } else if (colorType === 4) {
        out[d] = out[d + 1] = out[d + 2] = sample(y, x * 2);
        out[d + 3] = sample(y, x * 2 + 1);
      } else {
        const idx = sample(y, x);
        if (!palette || idx * 3 + 2 >= palette.length) throw new Error('The PNG palette is broken.');
        out[d] = palette[idx * 3];
        out[d + 1] = palette[idx * 3 + 1];
        out[d + 2] = palette[idx * 3 + 2];
        out[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
      }
    }
  }
  return { width, height, data: out };
}

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** Write an RGBA image as a PNG (8-bit RGBA, rows stored with the Sub filter). */
export function encodePng(img: Rgba): Uint8Array {
  const { width, height, data } = img;
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 1; // Sub
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? data[y * stride + x - 4] : 0;
      raw[y * (stride + 1) + 1 + x] = (data[y * stride + x] - left) & 0xff;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [new Uint8Array(SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
