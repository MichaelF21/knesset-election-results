import { compare, partyColor, results, unitOf, type Model } from './model';
import type { UnitSwing } from './swing';
import type { ElectionKey, Level, Unit, View } from './types';

export interface PartyRow {
  letters: string;
  election: ElectionKey;
  votes: number;
  share: number;
  color: string;
  swing: number | null;
  share22: number | null;
  parts22?: Record<string, number>;
  kind?: string;
  splitFrom?: string;
}

export interface UnitRows {
  election: ElectionKey;
  unit: Unit | null;
  rows: PartyRow[];
  swing: UnitSwing | null;
}

export function unitRows(m: Model, view: View, level: Level, id: string): UnitRows {
  const e: ElectionKey = view === '25' ? '25' : '26';
  const unit = unitOf(results(m, e), level, id);
  const swing = view === 'compare' ? compare(m, level, id) : null;
  if (!unit || !unit.valid) return { election: e, unit, rows: [], swing };
  const rows: PartyRow[] = Object.entries(unit.votes)
    .map(([letters, votes]) => {
      const p = swing?.parties[letters];
      return {
        letters,
        election: e,
        votes,
        share: (votes / unit.valid) * 100,
        color: partyColor(m, e, letters),
        swing: p?.swing ?? null,
        share22: p?.share22 ?? null,
        parts22: p?.parts22,
        kind: p?.kind,
        splitFrom: p?.split_from,
      };
    })
    .sort((a, b) => b.votes - a.votes);
  return { election: e, unit, rows, swing };
}
