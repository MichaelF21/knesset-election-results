import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import type { ElectionKey, Meta, PartiesFile, Results, Unit } from './types';

const BASE = `${import.meta.env.BASE_URL}data/`;

// GitHub Pages lets browsers and its CDN cache files for 10 minutes. Results files carry the data
// version (meta.generated) in the URL, so a new ingest is fetched at once; meta.json itself gets a
// fresh URL on every check.
async function json<T>(path: string, version?: string): Promise<T | null> {
  const url = BASE + path + (version ? `?v=${encodeURIComponent(version)}` : '');
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) return null;
  return (await r.json()) as T;
}

/** The current meta.json, bypassing every cache. */
export function fetchMeta(): Promise<Meta | null> {
  return json<Meta>('meta.json', String(Date.now()));
}

export interface Core {
  meta: Meta;
  parties: PartiesFile;
  results: Record<ElectionKey, Results | null>;
}

async function loadResults(e: ElectionKey, v: string): Promise<Results | null> {
  const [nat, munis, locs] = await Promise.all([
    json<{ national: Unit; external: Unit | null; seats: Record<string, number> }>(`results/k${e}/national.json`, v),
    json<Record<string, Unit>>(`results/k${e}/municipalities.json`, v),
    json<Record<string, Unit>>(`results/k${e}/localities.json`, v),
  ]);
  if (!nat || !munis || !locs) return null;
  return { ...nat, municipalities: munis, localities: locs, areas: null };
}

/** All results for a meta.json version (pass the meta already fetched to avoid a second request). */
export async function loadCore(known?: Meta): Promise<Core> {
  const meta = known ?? (await fetchMeta());
  if (!meta) throw new Error('missing meta.json');
  const v = meta.generated;
  const parties = await json<PartiesFile>('parties.json', v);
  if (!parties) throw new Error('missing parties.json');
  const has26 = meta.elections['26']?.status !== 'not_published';
  const [k25, k26] = await Promise.all([loadResults('25', v), has26 ? loadResults('26', v) : Promise.resolve(null)]);
  return { meta, parties, results: { '25': k25, '26': k26 } };
}

// 2022 neighborhood results never change; 2026 ones are cached per data version.
const areaCache = new Map<string, Promise<Record<string, Unit> | null>>();
export function loadAreaResults(e: ElectionKey, version?: string): Promise<Record<string, Unit> | null> {
  const v = e === '25' ? undefined : version;
  const key = `${e}|${v ?? ''}`;
  if (!areaCache.has(key)) areaCache.set(key, json<Record<string, Unit>>(`results/k${e}/areas.json`, v));
  return areaCache.get(key)!;
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
