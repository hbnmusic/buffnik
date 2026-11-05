/**
 * Where worn gear is drawn on a character. Pure, so it is unit tested.
 *
 * Sheet characters are full-body, front-view figures trimmed to their outline, so a proportional layout fits them:
 * every slot has a default centre and size as fractions of the figure's box, and the player can nudge each worn
 * item (position and size) per character. [inference: gear icons are flat front-view pictures, so they sit on the
 * character like stickers rather than bending around the body.]
 */
import type { GearSlot, Look } from '../engine';
import { GEAR_SLOTS } from '../engine';

/** A per-item adjustment. dx and dy are fractions of the figure's width and height; scale multiplies the size. */
export interface GearFit {
  dx: number;
  dy: number;
  scale: number;
}

export const NO_FIT: GearFit = { dx: 0, dy: 0, scale: 1 };

export interface Placement {
  /** Centre, as fractions of the figure's width and height (0,0 is the top-left of the figure). */
  x: number;
  y: number;
  /** Side of the square the icon is fitted into, as a fraction of the figure's height. */
  size: number;
  /** Drawn behind the character instead of in front. */
  behind?: boolean;
}

export const DEFAULT_PLACEMENT: Record<GearSlot, Placement> = {
  head: { x: 0.5, y: 0.06, size: 0.14 },
  face: { x: 0.5, y: 0.1, size: 0.11 },
  body: { x: 0.5, y: 0.32, size: 0.3 },
  hands: { x: 0.5, y: 0.44, size: 0.28 },
  feet: { x: 0.5, y: 0.92, size: 0.24 },
  back: { x: 0.9, y: 0.4, size: 0.3, behind: true },
  weapon: { x: 0.9, y: 0.62, size: 0.36 },
  accessory: { x: 0.08, y: 0.2, size: 0.2 },
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The part of a box that a picture fills when shown with "contain" scaling. Without a size, a typical figure box. */
export function figureRect(boxW: number, boxH: number, imgW?: number, imgH?: number): Rect {
  if (imgW && imgH) {
    const s = Math.min(boxW / imgW, boxH / imgH);
    const w = imgW * s;
    const h = imgH * s;
    return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
  }
  return { x: boxW * 0.2, y: boxH * 0.04, w: boxW * 0.6, h: boxH * 0.92 };
}

export interface Placed {
  left: number;
  top: number;
  size: number;
  behind: boolean;
}

export function placeGear(slot: GearSlot, fit: GearFit | undefined, rect: Rect): Placed {
  const p = DEFAULT_PLACEMENT[slot];
  const f = fit ?? NO_FIT;
  const size = p.size * f.scale * rect.h;
  const cx = rect.x + (p.x + f.dx) * rect.w;
  const cy = rect.y + (p.y + f.dy) * rect.h;
  return { left: cx - size / 2, top: cy - size / 2, size, behind: !!p.behind };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Move or resize an item's fit by a step, keeping it on the sheet. */
export function adjustFit(fit: GearFit | undefined, step: { dx?: number; dy?: number; scaleBy?: number }): GearFit {
  const f = fit ?? NO_FIT;
  return {
    dx: round(clamp(f.dx + (step.dx ?? 0), -0.8, 0.8)),
    dy: round(clamp(f.dy + (step.dy ?? 0), -0.6, 0.6)),
    scale: round(clamp(f.scale * (step.scaleBy ?? 1), 0.3, 3)),
  };
}

export interface WornItem {
  look: Look;
  slot: GearSlot;
  fit?: GearFit;
}

/** The gear a character wears, in slot order, with its fit. Items that no longer exist are skipped. */
export function wornGear(gear: Partial<Record<GearSlot, string>> | undefined, fits: Record<string, GearFit> | undefined, catalog: Look[]): WornItem[] {
  return GEAR_SLOTS.flatMap((slot) => {
    const look = catalog.find((l) => l.id === gear?.[slot]);
    return look && look.pack ? [{ look, slot, fit: fits?.[look.id] }] : [];
  });
}
