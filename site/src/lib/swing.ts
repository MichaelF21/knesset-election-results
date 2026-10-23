// Mirror of pipeline/swing.py. tests: swing.test.ts runs tests/fixtures/swing_cases.json through both.
import type { BlocDefs, LineageEntry, LineageKind, Votes } from './types';

export const SMALL_SAMPLE = 100;

export interface PartySwing {
  kind: LineageKind;
  share26: number | null;
  share22: number | null;
  swing: number | null;
  parts22?: Record<string, number>;
  split_from?: string;
}

export interface ShareSwing {
  share22: number | null;
  share26: number | null;
  swing: number | null;
}

export interface UnitSwing {
  parties: Record<string, PartySwing>;
  families: Record<string, ShareSwing & { members: string[] }>;
  gone: Record<string, number>;
  blocs: Record<string, ShareSwing>;
  comparable: boolean;
  small_sample: boolean;
}

const share = (votes: Votes, letter: string, valid: number) => (valid ? ((votes[letter] ?? 0) / valid) * 100 : 0);
const r = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

export function blocOf(blocs: BlocDefs, election: 25 | 26, letter: string): string {
  let rest: string | null = null;
  for (const id of Object.keys(blocs.items)) {
    const b = blocs.items[id];
    if (b.rest) rest = id;
    else if ((b[`k${election}`] ?? []).includes(letter)) return id;
  }
  if (rest === null) throw new Error('blocs need one rest bloc');
  return rest;
}

export function families(lineage: LineageEntry[]): Record<string, string[]> {
  const fam: Record<string, string[]> = {};
  for (const e of lineage) if (e.kind === 'split' && e.split_from) (fam[e.split_from] ??= []).push(e.k26);
  return fam;
}

export function usedK25(lineage: LineageEntry[]): Set<string> {
  const used = new Set(Object.keys(families(lineage)));
  for (const e of lineage) for (const p of e.predecessors ?? []) used.add(p);
  return used;
}

export function unitSwing(
  v22: Votes | null,
  valid22: number,
  v26: Votes | null,
  valid26: number,
  lineage: LineageEntry[],
  blocs: BlocDefs,
): UnitSwing {
  const have22 = v22 !== null && valid22 > 0;
  const have26 = v26 !== null && valid26 > 0;
  const a: Votes = v22 ?? {};
  const b: Votes = v26 ?? {};

  const parties: Record<string, PartySwing> = {};
  for (const e of lineage) {
    if (e.kind === 'withdrawn') continue;
    const s26 = have26 ? share(b, e.k26, valid26) : null;
    const row: PartySwing = { kind: e.kind, share26: r(s26), share22: null, swing: null };
    const preds = e.predecessors ?? [];
    if ((e.kind === 'continuing' || e.kind === 'merger_existing_existing' || e.kind === 'merger_existing_new') && have22) {
      const parts: Record<string, number> = {};
      let s22 = 0;
      for (const p of preds) {
        parts[p] = share(a, p, valid22);
        s22 += parts[p];
      }
      row.share22 = r(s22);
      if (e.kind === 'merger_existing_existing') {
        row.parts22 = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r(v)!]));
      }
      if (s26 !== null) row.swing = r(s26 - s22);
    }
    if (e.kind === 'split') row.split_from = e.split_from;
    parties[e.k26] = row;
  }

  const fams: UnitSwing['families'] = {};
  for (const [src, members] of Object.entries(families(lineage))) {
    const s22 = have22 ? share(a, src, valid22) : null;
    const s26 = have26 ? members.reduce((t, m) => t + share(b, m, valid26), 0) : null;
    fams[src] = {
      members,
      share22: r(s22),
      share26: r(s26),
      swing: s22 !== null && s26 !== null ? r(s26 - s22) : null,
    };
  }

  const used = usedK25(lineage);
  const gone: Record<string, number> = {};
  if (have22) for (const k of Object.keys(a)) if (!used.has(k)) gone[k] = r(share(a, k, valid22))!;

  const blocRows: Record<string, ShareSwing> = {};
  for (const id of blocs.order) {
    const s22 = have22
      ? Object.keys(a).filter((k) => blocOf(blocs, 25, k) === id).reduce((t, k) => t + share(a, k, valid22), 0)
      : null;
    const s26 = have26
      ? Object.keys(b).filter((k) => blocOf(blocs, 26, k) === id).reduce((t, k) => t + share(b, k, valid26), 0)
      : null;
    blocRows[id] = { share22: r(s22), share26: r(s26), swing: s22 !== null && s26 !== null ? r(s26 - s22) : null };
  }

  return {
    parties,
    families: fams,
    gone,
    blocs: blocRows,
    comparable: have22 && have26,
    small_sample: (have22 && valid22 < SMALL_SAMPLE) || (have26 && valid26 < SMALL_SAMPLE),
  };
}

/** Swing of one 2026 list in a unit, following lineage: a split successor reports its family. */
export function partySwingValue(s: UnitSwing, letter: string): number | null {
  if (letter.startsWith('family:')) return s.families[letter.slice(7)]?.swing ?? null;
  const p = s.parties[letter];
  if (!p) return null;
  if (p.kind === 'split' && p.split_from) return s.families[p.split_from]?.swing ?? null;
  return p.swing;
}
