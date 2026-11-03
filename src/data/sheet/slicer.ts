/**
 * Cut a character sheet (one image: base character, alternate outfits and a grid of items on a flat
 * background) into separate transparent pieces. Pure functions on RGBA pixels.
 *
 *  1. The background colour is the median colour of the image border.
 *  2. Foreground = pixels far enough from it. A coarse grid of cells that hold solid foreground (clearly
 *     different from the background, so a faint glow around an item does not count) is grown a little, so
 *     parts of one item that sit close together join, and connected cells form pieces.
 *  3. Tall pieces (close to the tallest in height) are the character and its outfits; the rest are items,
 *     numbered in reading order (rows top to bottom, left to right within a row).
 *  4. Each piece is cut out with a soft edge: background-coloured pixels become transparent.
 */
import type { Rgba } from './png';

export interface SliceOptions {
  /** Colour distance (0 to 441) from the background beyond which a pixel is foreground. */
  tolerance: number;
  /** Pieces closer than this (fraction of image width) count as one piece. */
  mergeGap: number;
  /** The sheet has a base character (and optional outfits) in a top band. */
  hasCharacter: boolean;
  /** A piece at least this fraction of the tallest piece's height counts as a character or outfit. */
  characterHeightRatio: number;
  /** Cut pieces are scaled down to at most this many pixels on the longest side. */
  maxPieceSize: number;
}

export const DEFAULT_SLICE: SliceOptions = {
  tolerance: 40,
  mergeGap: 0.008,
  hasCharacter: true,
  characterHeightRatio: 0.6,
  maxPieceSize: 768,
};

export interface Piece {
  kind: 'character' | 'outfit' | 'item';
  /** Item number in reading order, starting at 1 (matches the numbered list). 0 for the character and outfits. */
  number: number;
  /** Outfit number, left to right, starting at 1. 0 for others. */
  outfit: number;
  box: { x: number; y: number; w: number; h: number };
  image: Rgba;
}

export interface SliceResult {
  background: [number, number, number];
  pieces: Piece[];
  warnings: string[];
}

const median = (hist: Uint32Array, total: number): number => {
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc * 2 >= total) return i;
  }
  return 255;
};

export function estimateBackground(img: Rgba): { color: [number, number, number]; flatFraction: number } {
  const { width: w, height: h, data } = img;
  const ring = Math.max(1, Math.min(3, Math.floor(Math.min(w, h) / 50)));
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  const border: number[] = [];
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) {
        x = w - ring - 1; // jump across the interior
        continue;
      }
      const i = (y * w + x) * 4;
      hist[0][data[i]]++;
      hist[1][data[i + 1]]++;
      hist[2][data[i + 2]]++;
      border.push(i);
      n++;
    }
  }
  const color: [number, number, number] = [median(hist[0], n), median(hist[1], n), median(hist[2], n)];
  let flat = 0;
  for (const i of border) if (dist(data, i, color) <= 30) flat++;
  return { color, flatFraction: n ? flat / n : 0 };
}

function dist(data: Uint8Array, i: number, bg: [number, number, number]): number {
  const dr = data[i] - bg[0];
  const dg = data[i + 1] - bg[1];
  const db = data[i + 2] - bg[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

interface Comp {
  label: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pixels: number;
}

/** Foreground pixel test. Pixels that are already transparent in the source are background. */
const isForeground = (data: Uint8Array, i: number, bg: [number, number, number], tol: number) => data[i + 3] > 127 && dist(data, i, bg) > tol;

export function sliceSheet(img: Rgba, partial: Partial<SliceOptions> = {}): SliceResult {
  const opt = { ...DEFAULT_SLICE, ...partial };
  const { width: w, height: h, data } = img;
  const warnings: string[] = [];
  const { color: bg, flatFraction } = estimateBackground(img);
  if (flatFraction < 0.85) warnings.push('The border of the image is not one flat colour. Pieces may be cut wrongly; regenerate the sheet on a flat solid background.');
  const sat = Math.max(...bg) - Math.min(...bg);
  if (sat < 40) warnings.push('The background is white, black or grey. Items of a similar colour can turn see-through. A saturated flat colour such as magenta works best.');

  // Coarse grid: a cell is "on" if any pixel in it is solid foreground. Faint foreground (a glow or soft
  // halo, only a little different from the background) does not make a cell "on", so a halo cannot join
  // two items that stand apart; the faint pixels next to a piece still join that piece afterwards.
  const solid = Math.max(opt.tolerance * 2.2, 90);
  const cell = Math.max(2, Math.round(w / 420));
  const cw = Math.ceil(w / cell);
  const ch = Math.ceil(h / cell);
  const on = new Uint8Array(cw * ch);
  const cellPixels = new Uint32Array(cw * ch);
  const faint = new Uint8Array(cw * ch);
  for (let y = 0; y < h; y++) {
    const cy = Math.floor(y / cell);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] <= 127) continue;
      const d = dist(data, i, bg);
      if (d <= opt.tolerance) continue;
      const c = cy * cw + Math.floor(x / cell);
      if (d > solid) {
        on[c] = 1;
        cellPixels[c]++;
      } else faint[c] = 1;
    }
  }

  // Grow by half the merge gap in cells, so pieces closer than the gap touch.
  const grow = Math.max(0, Math.round((opt.mergeGap * w) / cell / 2));
  const grown = new Uint8Array(cw * ch);
  if (grow === 0) grown.set(on);
  else {
    // Separable box dilation.
    const tmp = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      let last = -1e9;
      const lastR = new Int32Array(cw);
      for (let x = 0; x < cw; x++) {
        if (on[y * cw + x]) last = x;
        lastR[x] = last;
      }
      let next = 1e9;
      for (let x = cw - 1; x >= 0; x--) {
        if (on[y * cw + x]) next = x;
        if (x - lastR[x] <= grow || next - x <= grow) tmp[y * cw + x] = 1;
      }
    }
    for (let x = 0; x < cw; x++) {
      let last = -1e9;
      const lastR = new Int32Array(ch);
      for (let y = 0; y < ch; y++) {
        if (tmp[y * cw + x]) last = y;
        lastR[y] = last;
      }
      let next = 1e9;
      for (let y = ch - 1; y >= 0; y--) {
        if (tmp[y * cw + x]) next = y;
        if (y - lastR[y] <= grow || next - y <= grow) grown[y * cw + x] = 1;
      }
    }
  }

  // Connected components (8-connectivity) of the grown grid.
  const labels = new Int32Array(cw * ch).fill(-1);
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let start = 0; start < cw * ch; start++) {
    if (!grown[start] || labels[start] !== -1) continue;
    const label = comps.length;
    const c: Comp = { label, x0: 1e9, y0: 1e9, x1: -1, y1: -1, pixels: 0 };
    labels[start] = label;
    stack.push(start);
    while (stack.length) {
      const cur = stack.pop()!;
      const cx = cur % cw;
      const cy = (cur - cx) / cw;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const ni = ny * cw + nx;
          if (grown[ni] && labels[ni] === -1) {
            labels[ni] = label;
            stack.push(ni);
          }
        }
      }
    }
    comps.push(c);
  }

  // Cells with only faint foreground join the piece beside them (one cell out), so soft edges stay with their piece.
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const ci = cy * cw + cx;
      if (!faint[ci] || labels[ci] !== -1) continue;
      let found = -1;
      for (let dy = -1; dy <= 1 && found === -1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          if (grown[ny * cw + nx] && labels[ny * cw + nx] !== -1) {
            found = labels[ny * cw + nx];
            break;
          }
        }
      }
      if (found !== -1) labels[ci] = found;
    }
  }

  // Tight pixel boxes: each foreground pixel belongs to the component of its cell.
  for (let y = 0; y < h; y++) {
    const cy = Math.floor(y / cell);
    for (let x = 0; x < w; x++) {
      if (!isForeground(data, (y * w + x) * 4, bg, opt.tolerance)) continue;
      const lab = labels[cy * cw + Math.floor(x / cell)];
      if (lab === -1) continue; // faint halo that belongs to no piece
      const c = comps[lab];
      c.pixels++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
    }
  }

  // Drop specks, then fold pieces that sit entirely inside another piece's box into it.
  const minSide = Math.max(4, w * 0.012);
  const minPixels = Math.max(12, w * h * 0.00008);
  let alive = comps.filter((c) => c.pixels >= minPixels && Math.max(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) >= minSide);
  const remap = new Map<number, number>();
  for (const small of [...alive].sort((a, b) => a.pixels - b.pixels)) {
    const host = alive.find((b) => b !== small && b.x0 <= small.x0 && b.y0 <= small.y0 && b.x1 >= small.x1 && b.y1 >= small.y1 && b.pixels >= small.pixels * 4);
    if (host) {
      host.x0 = Math.min(host.x0, small.x0);
      host.pixels += small.pixels;
      remap.set(small.label, host.label);
      alive = alive.filter((c) => c !== small);
    }
  }
  const resolve = (l: number): number => {
    let cur = l;
    while (remap.has(cur)) cur = remap.get(cur)!;
    return cur;
  };

  if (alive.length === 0) return { background: bg, pieces: [], warnings: [...warnings, 'No pieces were found on the sheet.'] };

  // Classify.
  const heights = alive.map((c) => c.y1 - c.y0 + 1);
  const tallest = Math.max(...heights);
  const isChar = (c: Comp) => opt.hasCharacter && c.y1 - c.y0 + 1 >= opt.characterHeightRatio * tallest;
  const chars = alive.filter(isChar).sort((a, b) => a.x0 - b.x0);
  const items = alive.filter((c) => !isChar(c));

  // Reading order for items: rows by vertical centre, then left to right.
  const medH = [...items.map((c) => c.y1 - c.y0 + 1)].sort((a, b) => a - b)[Math.floor(items.length / 2)] ?? 1;
  const byCenter = [...items].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const rows: Comp[][] = [];
  let rowMean = 0;
  for (const c of byCenter) {
    const cy = (c.y0 + c.y1) / 2;
    const row = rows[rows.length - 1];
    if (row && Math.abs(cy - rowMean) <= medH * 0.6) {
      row.push(c);
      rowMean = (rowMean * (row.length - 1) + cy) / row.length;
    } else {
      rows.push([c]);
      rowMean = cy;
    }
  }
  const ordered = rows.flatMap((r) => r.sort((a, b) => a.x0 - b.x0));

  const pieces: Piece[] = [];
  const cut = (c: Comp, kind: Piece['kind'], number: number, outfit: number) => {
    const labels2 = new Set<number>([c.label, ...[...remap.entries()].filter(([from]) => resolve(from) === c.label).map(([from]) => from)]);
    pieces.push({ kind, number, outfit, box: { x: c.x0, y: c.y0, w: c.x1 - c.x0 + 1, h: c.y1 - c.y0 + 1 }, image: cutOut(img, bg, opt, c, labels, cw, cell, labels2) });
  };
  chars.forEach((c, i) => cut(c, i === 0 ? 'character' : 'outfit', 0, i === 0 ? 0 : i));
  ordered.forEach((c, i) => cut(c, 'item', i + 1, 0));
  return { background: bg, pieces, warnings };
}

/** Box dilation of a boolean mask by `r` pixels (square window), separable. */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    const lastR = new Int32Array(w);
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) last = x;
      lastR[x] = last;
    }
    let next = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (mask[y * w + x]) next = x;
      if (x - lastR[x] <= r || next - x <= r) tmp[y * w + x] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    const lastR = new Int32Array(h);
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) last = y;
      lastR[y] = last;
    }
    let next = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) next = y;
      if (y - lastR[y] <= r || next - y <= r) out[y * w + x] = 1;
    }
  }
  return out;
}

/**
 * Crop a piece and turn the background transparent. Pixels far from the background keep their colour.
 * Pixels at the border are matted: the piece's nearby solid colour f is found, and an edge pixel that lies
 * on the line between the background and f is a blend p = a*f + (1-a)*bg, so it becomes f with alpha a.
 * That removes the coloured fringe an anti-aliased edge would otherwise keep.
 */
function cutOut(img: Rgba, bg: [number, number, number], opt: SliceOptions, c: Comp, labels: Int32Array, cw: number, cell: number, mine: Set<number>): Rgba {
  const pad = 3;
  const x0 = Math.max(0, c.x0 - pad);
  const y0 = Math.max(0, c.y0 - pad);
  const x1 = Math.min(img.width - 1, c.x1 + pad);
  const y1 = Math.min(img.height - 1, c.y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const lo = opt.tolerance * 0.35;
  const hi = opt.tolerance * 1.1;

  const dst = new Float32Array(w * h);
  const bgLike = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      const sy = y0 + y;
      const si = (sy * img.width + sx) * 4;
      const i = y * w + x;
      const lab = labels[Math.floor(sy / cell) * cw + Math.floor(sx / cell)];
      const foreign = lab !== -1 && !mine.has(lab); // belongs to a neighbouring piece
      const d = dist(img.data, si, bg);
      dst[i] = d;
      if (foreign || d <= lo || img.data[si + 3] <= 127) bgLike[i] = 1;
    }
  }
  const nearBg = dilate(bgLike, w, h, 2);

  const out = new Uint8Array(w * h * 4);
  const R = 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bgLike[i]) continue;
      const si = ((y0 + y) * img.width + (x0 + x)) * 4;
      const o = i * 4;
      const pr = img.data[si];
      const pg = img.data[si + 1];
      const pb = img.data[si + 2];
      const srcA = img.data[si + 3] / 255;
      let r = pr;
      let g = pg;
      let b = pb;
      let a = 1;
      if (nearBg[i]) {
        // Edge pixel. Look for a purer colour q nearby (further from the background) such that this pixel
        // lies on the line between the background and q: then p = t*q + (1-t)*bg, so it is q at alpha t.
        const pdr = pr - bg[0];
        const pdg = pg - bg[1];
        const pdb = pb - bg[2];
        const pd2 = pdr * pdr + pdg * pdg + pdb * pdb;
        let bestD2 = 0;
        let bestT = 1;
        let bq = -1;
        for (let yy = Math.max(0, y - R); yy <= Math.min(h - 1, y + R); yy++) {
          for (let xx = Math.max(0, x - R); xx <= Math.min(w - 1, x + R); xx++) {
            const j = yy * w + xx;
            if (bgLike[j]) continue;
            const sj = ((y0 + yy) * img.width + (x0 + xx)) * 4;
            const qr = img.data[sj] - bg[0];
            const qg = img.data[sj + 1] - bg[1];
            const qb = img.data[sj + 2] - bg[2];
            const q2 = qr * qr + qg * qg + qb * qb;
            if (q2 <= pd2 * 1.15 + 100 || q2 <= bestD2) continue; // not purer than this pixel
            const t = Math.min(1, Math.max(0, (pdr * qr + pdg * qg + pdb * qb) / q2));
            const er = t * qr - pdr;
            const eg = t * qg - pdg;
            const eb = t * qb - pdb;
            if (Math.sqrt(er * er + eg * eg + eb * eb) <= 40) {
              bestD2 = q2;
              bestT = t;
              bq = sj;
            }
          }
        }
        if (bq >= 0) {
          a = bestT;
          r = img.data[bq];
          g = img.data[bq + 1];
          b = img.data[bq + 2];
        } else if (dst[i] < hi) {
          // Faint tint of the background: fade it out.
          a = (dst[i] - lo) / (hi - lo);
          r = clamp((pr - (1 - a) * bg[0]) / a);
          g = clamp((pg - (1 - a) * bg[1]) / a);
          b = clamp((pb - (1 - a) * bg[2]) / a);
        }
      }
      a *= srcA;
      if (a < 0.03) continue;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = Math.round(a * 255);
    }
  }
  return trim(downscale({ width: w, height: h, data: out }, opt.maxPieceSize));
}

/** Remove fully transparent margins, leaving 1 pixel. */
function trim(img: Rgba): Rgba {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return img;
  const x0 = Math.max(0, minX - 1);
  const y0 = Math.max(0, minY - 1);
  const x1 = Math.min(img.width - 1, maxX + 1);
  const y1 = Math.min(img.height - 1, maxY + 1);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4), y * w * 4);
  return { width: w, height: h, data: out };
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Area-average downscale (premultiplied alpha) so the longest side is at most `max`. */
export function downscale(img: Rgba, max: number): Rgba {
  const scale = Math.max(img.width, img.height) / max;
  if (scale <= 1) return img;
  const w = Math.max(1, Math.round(img.width / scale));
  const h = Math.max(1, Math.round(img.height / scale));
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * img.height) / h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * img.width) / w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * img.width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * img.width + sx) * 4;
          const al = img.data[i + 3];
          r += img.data[i] * al;
          g += img.data[i + 1] * al;
          b += img.data[i + 2] * al;
          a += al;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round(a / n);
    }
  }
  return { width: w, height: h, data: out };
}
