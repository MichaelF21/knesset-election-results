// Map color scales. Each theme has its own steps (dark is not an automatic flip).
import type { Theme } from './theme';

// Diverging swing scale: magenta ↔ neutral ↔ green (PiYG family, colorblind-safe), capped at ±20 pp.
export const SWING_CAP = 20;
const NEG = [197, 27, 125]; // #c51b7d
const POS = [77, 146, 33]; // #4d9221
const NEG_DARK = [233, 98, 170];
const POS_DARK = [127, 196, 74];
const MID = { light: [240, 239, 236], dark: [58, 58, 54] }; // grey midpoint: #f0efec / #3a3a36

const mix = (a: number[], b: number[], t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
const hex = (c: number[]) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;

export function swingColor(pp: number, theme: Theme = 'light'): string {
  const t = Math.max(-1, Math.min(1, pp / SWING_CAP));
  // perceptual-ish easing so small swings still show
  const e = Math.sign(t) * Math.sqrt(Math.abs(t));
  const neg = theme === 'dark' ? NEG_DARK : NEG;
  const pos = theme === 'dark' ? POS_DARK : POS;
  return hex(e < 0 ? mix(MID[theme], neg, -e) : mix(MID[theme], pos, e));
}

export const SWING_STOPS = [-20, -10, -5, -2, 0, 2, 5, 10, 20];

/** Opacity for the largest-party mode: light at ≤30% winner share, solid at ≥60%. */
export function winnerOpacity(share: number | null): number {
  if (share === null) return 0;
  const t = Math.max(0, Math.min(1, (share - 30) / 30));
  return 0.28 + 0.72 * t;
}

// Sequential turnout scale: one hue (blue). Light theme: light → dark; dark theme: dim → bright.
const TURNOUT = {
  light: { lo: [222, 235, 247], hi: [8, 48, 107] },
  dark: { lo: [30, 44, 62], hi: [158, 208, 255] },
};
export const TURNOUT_RANGE: [number, number] = [40, 90];
export function turnoutColor(t: number, theme: Theme = 'light'): string {
  const x = Math.max(0, Math.min(1, (t - TURNOUT_RANGE[0]) / (TURNOUT_RANGE[1] - TURNOUT_RANGE[0])));
  return hex(mix(TURNOUT[theme].lo, TURNOUT[theme].hi, x));
}

/** Black or white text, whichever has more contrast on `bg` (WCAG relative luminance). */
export function textOn(bg: string): string {
  const c = bg.replace('#', '');
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(c.slice(i, i + 2), 16)));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#000000' : '#ffffff';
}
