/**
 * The drawn character, as a tree of simple shapes. Pure data, so it renders with
 * react-native-svg on the phone and to a plain SVG string for checking in a browser.
 * Canvas is 200 x 320, character centred on x = 100.
 */
import type { Accessory, LookStyle } from '../engine/wardrobe';

export interface El {
  t: 'g' | 'rect' | 'circle' | 'ellipse' | 'path';
  p: Record<string, string | number>;
  c?: El[];
}

export const VIEWBOX = '0 0 200 320';

export interface FigureLook {
  style: LookStyle;
  primary: string;
  secondary: string;
  accent: string;
  accessory: Accessory;
}

export interface FigureParams {
  /** Body build tier, 1 to 5. */
  tier: number;
  skin: string;
  hairStyle: number;
  hairColor: string;
  eyeColor: string;
  look: FigureLook;
  /** Background tint, usually from the look's rarity. */
  background?: string;
}

export const HAIR_STYLES = ['Spiky', 'Bob', 'Long', 'Ponytail'] as const;
export const SKIN_TONES = ['#FFDDC4', '#F4C7A1', '#D9A06F', '#B97A4B', '#8A5634', '#5E3A24'];
export const HAIR_COLORS = ['#2A2433', '#5B3A29', '#B5651D', '#E8C468', '#C23B5A', '#4C7DD9', '#7C5CFF', '#E9E6F5'];
export const EYE_COLORS = ['#4C7DD9', '#3E8E6B', '#8A5634', '#7C5CFF', '#D94C6B', '#2AA7A0'];

export const RARITY_BACKGROUND: Record<string, string> = {
  common: '#262140',
  rare: '#1F3A4A',
  epic: '#3A1F4A',
  legendary: '#4A3A1F',
};

/** Darken (factor < 1) or lighten (factor > 1) a #RRGGBB colour. */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    const out = factor <= 1 ? v * factor : v + (255 - v) * (factor - 1);
    return Math.max(0, Math.min(255, Math.round(out)));
  };
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0, extra: El['p'] = {}): El => ({
  t: 'rect',
  p: { x, y, width: w, height: h, rx, fill, ...extra },
});
const circle = (cx: number, cy: number, r: number, fill: string, extra: El['p'] = {}): El => ({ t: 'circle', p: { cx, cy, r, fill, ...extra } });
const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, extra: El['p'] = {}): El => ({ t: 'ellipse', p: { cx, cy, rx, ry, fill, ...extra } });
const path = (d: string, fill: string, extra: El['p'] = {}): El => ({ t: 'path', p: { d, fill, ...extra } });
const stroke = (d: string, color: string, width: number, extra: El['p'] = {}): El => path(d, 'none', { stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildFigure(params: FigureParams): El[] {
  const tier = Math.min(5, Math.max(1, Math.round(params.tier)));
  const u = (tier - 1) / 4;
  const { skin, hairColor, eyeColor, look } = params;
  const skinDark = shade(skin, 0.86);
  const outline = '#2A2433';

  const sh = 30 + 14 * u; // shoulder half-width
  const wh = 22 + 8 * u; // waist half-width
  const armW = 11 + 6 * u;
  const legW = 16 + 6 * u;
  const lx = 100 - sh - armW / 2 + 3; // left arm centre
  const rx = 100 + sh + armW / 2 - 3;
  const legGap = legW / 2 + 1.5;
  const style = look.style;
  const longPants = ['gi', 'armor', 'suit', 'jacket', 'hoodie'].includes(style);
  const robe = style === 'robe';
  const longSleeves = ['hoodie', 'jacket', 'gi', 'armor', 'robe', 'suit'].includes(style);
  const shortSleeves = ['tee', 'jersey'].includes(style);
  const sleeveEnd = style === 'gi' ? 176 : 196;

  const els: El[] = [];
  els.push(rect(0, 0, 200, 320, params.background ?? '#262140', 16));
  els.push(circle(100, 150, 96, look.accent, { opacity: 0.1 }));
  els.push(ellipse(100, 310, 52, 6, '#000000', { opacity: 0.3 }));

  // Behind the body.
  if (look.accessory === 'cape') {
    els.push(path(`M${r1(100 - sh - 2)},128 L${r1(100 + sh + 2)},128 L${r1(100 + sh + 30)},282 Q100,296 ${r1(100 - sh - 30)},282 Z`, shade(look.accent, 0.75)));
    els.push(path(`M${r1(100 - sh - 2)},128 L${r1(100 + sh + 2)},128 L${r1(100 + sh + 30)},282 Q100,296 ${r1(100 - sh - 30)},282 Z`, 'none', { stroke: look.accent, 'stroke-width': 2 }));
  }
  if (params.hairStyle === 2) els.push(rect(54, 46, 92, 124, hairColor, 30));
  if (params.hairStyle === 3) {
    els.push(path('M138,52 C168,48 176,92 160,128 C156,108 148,96 140,88 Z', hairColor));
    els.push(circle(140, 56, 5, look.accent));
  }
  if (style === 'hoodie') els.push(ellipse(100, 124, sh - 2, 16, shade(look.primary, 0.8)));

  // Legs and bottoms.
  const legTop = 206;
  for (const dir of [-1, 1]) {
    const cx = 100 + dir * legGap;
    const x = cx - legW / 2;
    els.push(rect(x, legTop, legW, 92, skin, legW / 2));
    if (!robe) {
      const h = longPants ? 90 : 42;
      els.push(rect(x - 1, legTop - 2, legW + 2, h, look.secondary, 4));
      if (longPants) els.push(rect(x - 1, legTop + h - 10, legW + 2, 8, shade(look.secondary, 0.85), 3));
    }
    els.push(ellipse(cx + dir * 2, 300, legW / 2 + 5, 6, style === 'gi' || style === 'robe' ? '#E9E6F5' : '#EDEAF7'));
    els.push(ellipse(cx + dir * 2, 303, legW / 2 + 5, 3, shade(look.accent, 0.9), { opacity: 0.6 }));
  }
  if (robe) {
    els.push(path(`M${r1(100 - wh - 2)},204 L${r1(100 + wh + 2)},204 L${r1(100 + wh + 20)},276 Q100,286 ${r1(100 - wh - 20)},276 Z`, look.primary));
  }

  // Arms (skin first; sleeves drawn over them).
  for (const [cx, dir] of [
    [lx, -1],
    [rx, 1],
  ] as const) {
    els.push(rect(cx - armW / 2, 128, armW, 74, skin, armW / 2));
    els.push(circle(cx, 205, armW / 2 + 1.5, skin));
    if (longSleeves) {
      els.push(rect(cx - armW / 2 - 1, 126, armW + 2, sleeveEnd - 126, robe ? shade(look.primary, 1) : look.primary, armW / 2));
      if (style === 'hoodie' || style === 'jacket') els.push(rect(cx - armW / 2 - 1, sleeveEnd - 8, armW + 2, 8, shade(look.primary, 0.8), 3));
      if (style === 'armor') els.push(rect(cx - armW / 2 - 2, 168, armW + 4, 26, look.accent, 5, { opacity: 0.95 }));
      if (style === 'robe') els.push(path(`M${cx - armW / 2 - 4},170 L${cx + armW / 2 + 4},170 L${cx + dir * (armW / 2 + 12)},214 L${cx - dir * 2},214 Z`, look.primary));
    } else if (shortSleeves) {
      els.push(rect(cx - armW / 2 - 1, 126, armW + 2, 32, look.primary, armW / 2));
      els.push(rect(cx - armW / 2 - 1, 150, armW + 2, 6, look.accent, 2, { opacity: style === 'jersey' ? 1 : 0.5 }));
    }
  }

  // Torso.
  const torso = `M${r1(100 - sh)},128 Q100,119 ${r1(100 + sh)},128 L${r1(100 + wh)},212 Q100,219 ${r1(100 - wh)},212 Z`;
  els.push(path(torso, skin));
  if (tier >= 4 && style === 'tank') {
    els.push(stroke(`M100,150 L100,200`, skinDark, 1.5, { opacity: 0.6 }));
    els.push(stroke(`M${r1(100 - wh + 8)},170 L${r1(100 + wh - 8)},170`, skinDark, 1.5, { opacity: 0.6 }));
    els.push(stroke(`M${r1(100 - wh + 8)},186 L${r1(100 + wh - 8)},186`, skinDark, 1.5, { opacity: 0.6 }));
  }
  if (tier >= 3) els.push(stroke(`M${r1(100 - sh + 12)},146 Q${r1(100 - 10)},158 100,152 Q${r1(100 + 10)},158 ${r1(100 + sh - 12)},146`, skinDark, 1.6, { opacity: 0.5 }));

  if (style === 'tank') {
    const s = sh - 7;
    els.push(path(`M${r1(100 - s)},132 L${r1(100 - s + 9)},132 Q100,152 ${r1(100 + s - 9)},132 L${r1(100 + s)},132 L${r1(100 + wh)},212 Q100,219 ${r1(100 - wh)},212 Z`, look.primary));
    els.push(stroke(`M${r1(100 - wh + 3)},206 L${r1(100 + wh - 3)},206`, look.accent, 3));
  } else if (robe) {
    els.push(path(`M${r1(100 - sh)},128 Q100,119 ${r1(100 + sh)},128 L${r1(100 + wh + 4)},206 L${r1(100 - wh - 4)},206 Z`, look.primary));
    els.push(path('M100,124 L84,160 L100,206 L116,160 Z', shade(look.primary, 0.78), { opacity: 0.5 }));
    els.push(rect(100 - wh - 5, 192, 2 * wh + 10, 12, look.accent, 3));
  } else {
    els.push(path(torso, look.primary));
  }

  switch (style) {
    case 'tee':
      els.push(path('M90,124 Q100,136 110,124 Z', shade(look.primary, 0.8)));
      break;
    case 'jersey':
      els.push(path('M90,124 Q100,138 110,124 Z', look.accent));
      els.push(rect(100 - wh + 2, 160, 2 * wh - 4, 6, look.accent, 2));
      els.push(rect(100 - wh + 2, 172, 2 * wh - 4, 6, look.accent, 2, { opacity: 0.6 }));
      break;
    case 'hoodie':
      els.push(rect(100 - wh + 4, 178, 2 * wh - 8, 26, shade(look.primary, 0.84), 6));
      els.push(stroke('M94,128 L92,152', look.accent, 2));
      els.push(stroke('M106,128 L108,152', look.accent, 2));
      break;
    case 'jacket':
      els.push(stroke('M100,126 L100,212', look.accent, 3));
      els.push(path('M88,124 L100,138 L112,124 Z', shade(look.primary, 0.78)));
      break;
    case 'gi':
      els.push(stroke(`M92,126 L${r1(100 + 6)},176`, look.accent, 3));
      els.push(stroke(`M108,126 L${r1(100 - 6)},176`, look.accent, 3));
      els.push(rect(100 - wh - 1, 190, 2 * wh + 2, 10, look.accent, 3));
      break;
    case 'armor':
      els.push(path(`M${r1(100 - wh + 4)},140 Q100,150 ${r1(100 + wh - 4)},140 L${r1(100 + wh - 6)},196 Q100,206 ${r1(100 - wh + 6)},196 Z`, look.accent, { opacity: 0.22 }));
      els.push(stroke('M100,134 L100,204', look.accent, 2.5));
      els.push(circle(100 - sh + 2, 132, 13 + 3 * u, look.primary, { stroke: look.accent, 'stroke-width': 2.5 }));
      els.push(circle(100 + sh - 2, 132, 13 + 3 * u, look.primary, { stroke: look.accent, 'stroke-width': 2.5 }));
      els.push(rect(100 - wh - 1, 200, 2 * wh + 2, 9, look.accent, 3));
      break;
    case 'suit':
      els.push(path('M92,124 L100,176 L108,124 Z', '#F1EEF8'));
      els.push(path('M100,132 L95,150 L100,174 L105,150 Z', look.accent));
      els.push(stroke('M88,124 L100,172 L112,124', shade(look.primary, 1.5), 2));
      break;
    default:
      break;
  }

  // Neck and head.
  els.push(rect(91, 108, 18, 22, skinDark, 6));
  if (look.accessory === 'scarf') {
    els.push(rect(78, 118, 44, 13, look.accent, 6));
    els.push(path('M112,126 L124,126 L128,160 L116,158 Z', shade(look.accent, 0.85)));
  }
  els.push(circle(63, 86, 7, skin), circle(137, 86, 7, skin));
  els.push(ellipse(100, 80, 37, 41, skin));
  els.push(ellipse(100, 112, 24, 5, skinDark, { opacity: 0.45 }));

  // Face.
  for (const dir of [-1, 1]) {
    const ex = 100 + dir * 17;
    els.push(ellipse(ex, 84, 9.5, 12, '#FFFFFF'));
    els.push(ellipse(ex, 85, 7, 10, eyeColor));
    els.push(ellipse(ex, 86, 3.4, 6, outline));
    els.push(circle(ex - 2.4, 80, 2.6, '#FFFFFF'));
    els.push(circle(ex + 2.2, 90, 1.3, '#FFFFFF', { opacity: 0.8 }));
    els.push(stroke(`M${ex - 10},80 Q${ex},70 ${ex + 10},80`, outline, 2.6));
    els.push(stroke(`M${ex - 8},64 Q${ex},60 ${ex + 8},65`, shade(hairColor, 0.8), 2.4));
    els.push(circle(100 + dir * 28, 96, 5.5, '#FF8FA3', { opacity: 0.35 }));
  }
  els.push(stroke('M99,96 Q100,98 101,96', skinDark, 1.6));
  els.push(stroke('M91,104 Q100,111 109,104', '#8A4B4B', 2.2));

  // Hair in front.
  const cap = 'M58,86 C54,38 80,22 100,22 C120,22 146,38 142,86 ';
  if (params.hairStyle === 0) {
    els.push(path(`${cap}L134,62 L127,78 L117,54 L107,74 L97,52 L87,74 L77,56 L68,78 Z`, hairColor));
  } else if (params.hairStyle === 1) {
    els.push(path(`${cap}C132,66 118,58 100,58 C82,58 68,66 58,86 Z`, hairColor));
    els.push(rect(54, 62, 12, 50, hairColor, 6), rect(134, 62, 12, 50, hairColor, 6));
  } else if (params.hairStyle === 2) {
    els.push(path(`${cap}C134,64 120,56 100,56 C80,56 66,64 58,86 Z`, hairColor));
    els.push(rect(52, 60, 14, 100, hairColor, 7), rect(134, 60, 14, 100, hairColor, 7));
  } else {
    els.push(path(`${cap}C134,66 120,58 100,58 C80,58 66,66 58,86 Z`, hairColor));
  }
  els.push(path('M70,40 C80,30 96,28 110,30', 'none', { stroke: shade(hairColor, 1.5), 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.35 }));

  // Accessories in front.
  if (look.accessory === 'headband') {
    els.push(rect(60, 52, 80, 9, look.accent, 3));
    els.push(circle(62, 58, 6, shade(look.accent, 0.85)));
  }
  if (look.accessory === 'glasses') {
    els.push(circle(83, 84, 13, '#FFFFFF', { opacity: 0.14 }), circle(117, 84, 13, '#FFFFFF', { opacity: 0.14 }));
    els.push(circle(83, 84, 13, 'none', { stroke: outline, 'stroke-width': 2.4 }), circle(117, 84, 13, 'none', { stroke: outline, 'stroke-width': 2.4 }));
    els.push(stroke('M96,84 L104,84', outline, 2.4));
  }
  return els;
}
