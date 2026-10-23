import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import type { ElectionKey, Meta, PartiesFile, Results, Unit } from './types';

const BASE = `${import.meta.env.BASE_URL}data/`;

async function json<T>(path: string): Promise<T | null> {
  const r = await fetch(BASE + path, { cache: 'no-cache' });
  if (!r.ok) return null;
  return (await r.json()) as T;
}

export interface Core {
  meta: Meta;
  parties: PartiesFile;
  results: Record<ElectionKey, Results | null>;
}

async function loadResults(e: ElectionKey): Promise<Results | null> {
  const [nat, munis, locs] = await Promise.all([
    json<{ national: Unit; external: Unit | null; seats: Record<string, number> }>(`results/k${e}/national.json`),
    json<Record<string, Unit>>(`results/k${e}/municipalities.json`),
    json<Record<string, Unit>>(`results/k${e}/localities.json`),
  ]);
  if (!nat || !munis || !locs) return null;
  return { ...nat, municipalities: munis, localities: locs, areas: null };
}

export async function loadCore(): Promise<Core> {
  const [meta, parties] = await Promise.all([json<Meta>('meta.json'), json<PartiesFile>('parties.json')]);
  if (!meta || !parties) throw new Error('missing meta.json / parties.json');
  const has26 = meta.elections['26']?.status !== 'not_published';
  const [k25, k26] = await Promise.all([loadResults('25'), has26 ? loadResults('26') : Promise.resolve(null)]);
  return { meta, parties, results: { '25': k25, '26': k26 } };
}

const areaCache: Partial<Record<ElectionKey, Promise<Record<string, Unit> | null>>> = {};
export function loadAreaResults(e: ElectionKey): Promise<Record<string, Unit> | null> {
  return (areaCache[e] ??= json<Record<string, Unit>>(`results/k${e}/areas.json`));
}

export type FC = FeatureCollection<Geometry, { id: string; [k: string]: unknown }>;

async function topo(path: string, object: string): Promise<FC | null> {
  const t = await json<Topology>(path);
  if (!t) return null;
  return feature(t, t.objects[object]) as unknown as FC;
}

export interface Geo {
  municipalities: FC;
  localities: FC;
  noJurisdiction: FC | null;
  /** locality dots; poly: the locality also has a polygon (the dot fades out when zoomed in) */
  points: { id: string; name: string; muni: string; lon: number; lat: number; poly: boolean }[];
}

export async function loadGeo(): Promise<Geo> {
  const [municipalities, localities, noJurisdiction, points] = await Promise.all([
    topo('geo/municipalities.topojson', 'municipalities'),
    topo('geo/localities.topojson', 'localities'),
    topo('geo/no_jurisdiction.topojson', 'no_jurisdiction'),
    json<Geo['points']>('geo/points.json'),
  ]);
  if (!municipalities || !localities) throw new Error('missing geometry');
  return { municipalities, localities, noJurisdiction, points: points ?? [] };
}

const areaGeoCache = new Map<string, Promise<FC | null>>();
export function loadAreaGeo(city: string): Promise<FC | null> {
  if (!areaGeoCache.has(city)) areaGeoCache.set(city, json<FC>(`geo/areas/${city}.json`));
  return areaGeoCache.get(city)!;
}
