// Joins results, party metadata and lineage into what the UI shows for any unit.
import { he } from '../i18n/he';
import { blocOf, partySwingValue, unitSwing, type UnitSwing } from './swing';
import type { BlocDefs, ElectionKey, LineageEntry, Level, Meta, PartiesFile, PartyInfo, Results, Unit, Votes } from './types';

export interface Model {
  meta: Meta;
  parties: PartiesFile;
  r25: Results;
  r26: Results | null;
  lineage: LineageEntry[];
  blocs: BlocDefs;
  p25: Record<string, PartyInfo>;
  p26: Record<string, PartyInfo>;
}

export function buildModel(meta: Meta, parties: PartiesFile, r25: Results, r26: Results | null): Model {
  const lineage: LineageEntry[] = parties.k26
    .filter((p) => p.lineage)
    .map((p) => ({ k26: p.letters, ...(p.lineage as Omit<LineageEntry, 'k26'>) }));
  return {
    meta,
    parties,
    r25,
    r26,
    lineage,
    blocs: parties.blocs,
    p25: Object.fromEntries(parties.k25.map((p) => [p.letters, p])),
    p26: Object.fromEntries(parties.k26.map((p) => [p.letters, p])),
  };
}

export function results(m: Model, e: ElectionKey): Results | null {
  return e === '25' ? m.r25 : m.r26;
}

export function unitOf(r: Results | null, level: Level, id: string): Unit | null {
  if (!r) return null;
  switch (level) {
    case 'national':
      return r.national;
    case 'municipality':
      return r.municipalities[id] ?? null;
    case 'locality':
      return r.localities[id] ?? null;
    case 'area':
      return r.areas?.[id] ?? null;
  }
}

export function party(m: Model, e: ElectionKey, letters: string): PartyInfo | undefined {
  return e === '25' ? m.p25[letters] : m.p26[letters];
}

export function partyColor(m: Model, e: ElectionKey, letters: string | null): string {
  if (!letters) return m.parties.default_color;
  return party(m, e, letters)?.color ?? m.parties.default_color;
}

export function partyName(m: Model, e: ElectionKey, letters: string): string {
  return party(m, e, letters)?.short_name ?? letters;
}

function sumUnits(units: (Unit | null | undefined)[]): { votes: Votes; valid: number; n: number } {
  const votes: Votes = {};
  let valid = 0;
  let n = 0;
  for (const u of units) {
    if (!u) continue;
    n++;
    valid += u.valid;
    for (const [k, v] of Object.entries(u.votes)) votes[k] = (votes[k] ?? 0) + v;
  }
  return { votes, valid, n };
}

const swingCache = new WeakMap<object, Map<string, UnitSwing>>();

/** Swing for a unit. Aggregates use only member localities counted in 2026 (partial results). */
export function compare(m: Model, level: Level, id: string): UnitSwing | null {
  if (!m.r26) return null;
  let cache = swingCache.get(m.r26);
  if (!cache) swingCache.set(m.r26, (cache = new Map()));
  const key = `${level}:${id}`;
  if (cache.has(key)) return cache.get(key)!;

  let s: UnitSwing;
  if (level === 'locality' || level === 'area') {
    const a = unitOf(m.r25, level, id);
    const b = unitOf(m.r26, level, id);
    const counted = b && b.valid > 0;
    s = unitSwing(a?.votes ?? null, a?.valid ?? 0, counted ? b.votes : null, counted ? b.valid : 0, m.lineage, m.blocs);
  } else {
    const codes =
      level === 'national'
        ? Object.keys(m.r26.localities)
        : (m.r26.municipalities[id]?.localities ?? m.r25.municipalities[id]?.localities ?? []);
    const counted = codes.filter((c) => (m.r26!.localities[c]?.valid ?? 0) > 0);
    const u22 = counted.map((c) => m.r25.localities[c]);
    const u26 = counted.map((c) => m.r26!.localities[c]);
    if (level === 'national' && m.r26.external && m.r26.external.valid > 0) {
      u22.push(m.r25.external!);
      u26.push(m.r26.external);
    }
    const a = sumUnits(u22);
    const b = sumUnits(u26);
    s = unitSwing(a.n ? a.votes : null, a.valid, b.n ? b.votes : null, b.valid, m.lineage, m.blocs);
  }
  cache.set(key, s);
  return s;
}

export { partySwingValue };

/** 2026 lists the swing-mode picker offers: running lists plus split families. */
export function swingTargets(m: Model): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const nat = m.r26?.national.votes ?? {};
  const running = m.parties.k26
    .filter((p) => p.lineage && p.lineage.kind !== 'withdrawn' && p.lineage.kind !== 'new' && p.lineage.kind !== 'split')
    .sort((a, b) => (nat[b.letters] ?? 0) - (nat[a.letters] ?? 0));
  for (const p of running) out.push({ value: p.letters, label: `${p.short_name} (${p.letters})` });
  for (const [src, members] of Object.entries(m.parties.families)) {
    const names = members.map((l) => m.p26[l]?.short_name ?? l).join(' + ');
    out.push({ value: `family:${src}`, label: he.modes.family(names) });
  }
  return out;
}

export function blocName(m: Model, id: string): string {
  return m.blocs.items[id]?.name ?? id;
}

export function blocShare(m: Model, e: ElectionKey, u: Unit, bloc: string): number | null {
  if (!u.valid) return null;
  let t = 0;
  for (const [k, v] of Object.entries(u.votes)) if (blocOf(m.blocs, e === '25' ? 25 : 26, k) === bloc) t += v;
  return (t / u.valid) * 100;
}

export interface Crumb {
  level: Level;
  id: string;
  name: string;
}

/** ארצי ← מועצה ← יישוב ← שכונה */
export function breadcrumbs(m: Model, level: Level, id: string): Crumb[] {
  const r = m.r26 ?? m.r25;
  const crumbs: Crumb[] = [{ level: 'national', id: 'IL', name: he.levels.national }];
  let loc: string | null = null;
  let muni: string | null = null;
  if (level === 'area') loc = (unitOf(m.r25, 'area', id) ?? unitOf(m.r26, 'area', id))?.parent ?? null;
  if (level === 'locality') loc = id;
  if (loc) muni = (m.r25.localities[loc] ?? r.localities[loc])?.parent ?? null;
  if (level === 'municipality') muni = id;
  if (muni) {
    const u = m.r25.municipalities[muni] ?? r.municipalities[muni];
    // a city is its own municipality: show it once
    if (u && !(loc && muni === `l${loc}`)) crumbs.push({ level: 'municipality', id: muni, name: u.name });
  }
  if (loc) {
    const u = m.r25.localities[loc] ?? r.localities[loc];
    if (u) crumbs.push({ level: 'locality', id: loc, name: u.name });
  }
  if (level === 'area') {
    const u = unitOf(m.r25, 'area', id) ?? unitOf(m.r26, 'area', id);
    crumbs.push({ level: 'area', id, name: u?.name || he.levels.area });
  }
  return crumbs;
}

export function badgeTexts(m: Model, letters: string): string[] {
  const p = m.p26[letters];
  const l = p?.lineage;
  if (!l) return [];
  switch (l.kind) {
    case 'new':
      return [he.badges.new];
    case 'merger_existing_existing':
      return [he.badges.merger((l.predecessors ?? []).join(' + '))];
    case 'merger_existing_new':
      return [he.badges.includesNew];
    case 'split':
      return [he.badges.split(l.split_from ?? '')];
    case 'continuing':
      return l.predecessors && l.predecessors[0] !== letters ? [he.badges.formerly(l.predecessors[0])] : [];
    default:
      return [];
  }
}
