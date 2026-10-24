import { compare, partyColor, partySwingValue, results, unitOf, type Model } from '../lib/model';
import { swingColor, turnoutColor, winnerOpacity } from '../lib/scales';
import type { Theme } from '../lib/theme';
import type { ColorMode, ElectionKey, Level, View } from '../lib/types';

export interface Paint {
  fill: string;
  op: number;
  nodata: boolean;
}

export interface PaintOptions {
  view: View;
  mode: ColorMode;
  swingTarget: string;
  blocTarget: string;
  theme: Theme;
}

const NODATA: Paint = { fill: '#d9d9d6', op: 1, nodata: true };
// 2026 tab before any results: one flat neutral color, not the "no data" hatching
const PENDING: Record<Theme, Paint> = {
  light: { fill: '#d6d5cf', op: 1, nodata: false },
  dark: { fill: '#3a3a36', op: 1, nodata: false },
};

export function shownElection(view: View): ElectionKey {
  return view === '25' ? '25' : '26';
}

export function paintUnit(m: Model, level: Level, id: string, o: PaintOptions): Paint {
  if (o.mode === 'partySwing' || o.mode === 'blocSwing') {
    const s = compare(m, level, id);
    if (!s || !s.comparable) return NODATA;
    const v = o.mode === 'partySwing' ? partySwingValue(s, o.swingTarget) : (s.blocs[o.blocTarget]?.swing ?? null);
    return v === null ? NODATA : { fill: swingColor(v, o.theme), op: 1, nodata: false };
  }
  const e = shownElection(o.view);
  if (e === '26' && !m.r26) return PENDING[o.theme];
  const u = unitOf(results(m, e), level, id);
  if (!u || !u.valid) return NODATA;
  if (o.mode === 'turnout') {
    return u.turnout === null ? NODATA : { fill: turnoutColor(u.turnout, o.theme), op: 1, nodata: false };
  }
  return { fill: partyColor(m, e, u.winner), op: winnerOpacity(u.winner_share), nodata: false };
}
