import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { loadAreaGeo, loadAreaResults, type FC, type Geo } from '../lib/data';
import type { Model } from '../lib/model';
import type { Level, Selection } from '../lib/types';
import { paintUnit, type PaintOptions } from './paint';
import { Tooltip } from '../components/Tooltip';
import { he } from '../i18n/he';
import type { Theme } from '../lib/theme';

// Zoom thresholds: municipalities → localities → neighborhoods.
export const Z_LOCALITIES = 9;
export const Z_AREAS = 11.5;
// Locality dots: small localities (regional-council members, West Bank settlements, …) are invisible
// as polygons at country zoom, so each gets a dot sized by its valid votes. Dots of localities that
// also have a polygon fade out between these zooms; polygon-less localities keep their dot.
const Z_DOTS_FADE: [number, number] = [11, 12];
const dotRadius = (valid: number) => Math.min(7, Math.max(2.6, 2 + Math.sqrt(valid) / 30));
const ISRAEL: [number, number, number, number] = [34.2, 29.45, 35.95, 33.35];

// Map chrome per theme: background, borders between units, selection, hatching for "no data".
const MAP_COLORS: Record<Theme, Record<string, string>> = {
  light: { bg: '#f4f3ef', line: '#ffffff', sel: '#111111', outline: '#55554f', pointStroke: '#ffffff', pointNoData: '#bdbdb8', hatchA: '#e4e4e1', hatchB: '#a3a39e' },
  dark: { bg: '#121211', line: '#1c1c1a', sel: '#ffffff', outline: '#c4c3bd', pointStroke: '#121211', pointNoData: '#55554f', hatchA: '#2a2a27', hatchB: '#55554f' },
};

// Touch screens: one finger scrolls the page, two fingers move the map.
const COARSE = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);

interface Props {
  model: Model;
  theme: Theme;
  geo: Geo;
  options: PaintOptions;
  outline: boolean;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  areasVersion: number;
  onAreasLoaded: () => void;
}

interface Hover {
  x: number;
  y: number;
  level: Level;
  id: string;
}

function hatchImage(theme: Theme): ImageData {
  const c0 = MAP_COLORS[theme];
  const n = 8;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = c0.hatchA;
  g.fillRect(0, 0, n, n);
  g.strokeStyle = c0.hatchB;
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(0, n);
  g.lineTo(n, 0);
  g.moveTo(-n / 2, n / 2);
  g.lineTo(n / 2, -n / 2);
  g.moveTo(n / 2, n + n / 2);
  g.lineTo(n + n / 2, n / 2);
  g.stroke();
  return g.getImageData(0, 0, n, n);
}

function bbox(features: FC['features']): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === 'number') {
      const [x, y] = c as number[];
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    } else (c as unknown[]).forEach(walk);
  };
  for (const f of features) if (f.geometry && 'coordinates' in f.geometry) walk(f.geometry.coordinates);
  return x0 === Infinity ? null : [x0, y0, x1, y1];
}

function applyTheme(map: maplibregl.Map, theme: Theme): void {
  const c = MAP_COLORS[theme];
  map.setPaintProperty('bg', 'background-color', c.bg);
  for (const id of ['munis-line', 'locs-line', 'areas-line']) map.setPaintProperty(id, 'line-color', c.line);
  for (const id of ['sel-munis', 'sel-locs', 'sel-areas']) map.setPaintProperty(id, 'line-color', c.sel);
  map.setPaintProperty('sel-points', 'circle-stroke-color', c.sel);
  map.setPaintProperty('outline', 'line-color', c.outline);
  map.setPaintProperty('points', 'circle-stroke-color', c.pointStroke);
  map.setPaintProperty('points', 'circle-color', ['case', ['get', 'nodata'], c.pointNoData, ['get', 'fill']]);
}

export function MapView({ model, theme, geo, options, outline, selection, onSelect, areasVersion, onAreasLoaded }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const areaFeatures = useRef<Map<string, FC['features']>>(new Map());
  const loadingCities = useRef<Set<string>>(new Set());
  const latest = useRef({ model, options, onSelect, onAreasLoaded, theme });
  latest.current = { model, options, onSelect, onAreasLoaded, theme };

  // Create the map once.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: ref.current!,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f4f3ef' } }],
      },
      bounds: ISRAEL,
      fitBoundsOptions: { padding: 12 },
      minZoom: 6,
      maxZoom: 15,
      attributionControl: false,
      cooperativeGestures: COARSE,
      locale: he.mapControls,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapRef.current = map;

    map.on('load', () => {
      map.addImage('hatch', hatchImage(latest.current.theme));
      const empty: FC = { type: 'FeatureCollection', features: [] };
      for (const id of ['munis', 'locs', 'areas', 'nojur', 'points']) {
        map.addSource(id, { type: 'geojson', data: empty, promoteId: 'id' });
      }
      const fillOp = (lo: number, hi: number, under = 0.35): maplibregl.ExpressionSpecification => [
        'interpolate', ['linear'], ['zoom'],
        lo, ['get', 'op'],
        hi, ['*', ['get', 'op'], under],
      ];
      map.addLayer({ id: 'nojur', type: 'fill', source: 'nojur', paint: { 'fill-pattern': 'hatch', 'fill-opacity': 0.6 } });
      map.addLayer({
        id: 'munis-fill', type: 'fill', source: 'munis',
        filter: ['!', ['get', 'nodata']],
        paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': fillOp(Z_LOCALITIES - 0.5, Z_LOCALITIES + 0.5) },
      });
      map.addLayer({ id: 'munis-hatch', type: 'fill', source: 'munis', filter: ['get', 'nodata'], paint: { 'fill-pattern': 'hatch' } });
      map.addLayer({
        id: 'munis-line', type: 'line', source: 'munis',
        paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 10, 1.4] },
      });
      map.addLayer({
        id: 'locs-fill', type: 'fill', source: 'locs', minzoom: Z_LOCALITIES - 0.5,
        filter: ['!', ['get', 'nodata']],
        paint: {
          'fill-color': ['get', 'fill'],
          'fill-opacity': [
            'interpolate', ['linear'], ['zoom'],
            Z_LOCALITIES - 0.5, 0,
            Z_LOCALITIES + 0.5, ['get', 'op'],
            Z_AREAS - 0.3, ['get', 'op'],
            Z_AREAS, ['case', ['get', 'hasAreas'], 0, ['get', 'op']],
          ],
        },
      });
      map.addLayer({
        id: 'locs-hatch', type: 'fill', source: 'locs', minzoom: Z_LOCALITIES - 0.5, filter: ['get', 'nodata'],
        paint: { 'fill-pattern': 'hatch' },
      });
      map.addLayer({
        id: 'locs-line', type: 'line', source: 'locs', minzoom: Z_LOCALITIES - 0.5,
        paint: { 'line-color': '#ffffff', 'line-width': 0.8, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'areas-fill', type: 'fill', source: 'areas', minzoom: Z_AREAS - 0.3,
        filter: ['!', ['get', 'nodata']],
        paint: {
          'fill-color': ['get', 'fill'],
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], Z_AREAS - 0.3, 0, Z_AREAS, ['get', 'op']],
        },
      });
      map.addLayer({ id: 'areas-hatch', type: 'fill', source: 'areas', minzoom: Z_AREAS, filter: ['get', 'nodata'], paint: { 'fill-pattern': 'hatch' } });
      map.addLayer({ id: 'areas-line', type: 'line', source: 'areas', minzoom: Z_AREAS, paint: { 'line-color': '#ffffff', 'line-width': 1 } });
      map.addLayer({
        id: 'outline', type: 'line', source: 'locs', layout: { visibility: 'none' },
        paint: { 'line-color': '#55554f', 'line-width': 0.5, 'line-opacity': 0.5 },
      });
      // selection outlines sit under the dots, so a selected council doesn't hide its localities' dots
      for (const [layer, src] of [['sel-munis', 'munis'], ['sel-locs', 'locs'], ['sel-areas', 'areas']] as const) {
        map.addLayer({
          id: layer, type: 'line', source: src, filter: ['==', ['get', 'id'], '__none__'],
          paint: { 'line-color': '#111111', 'line-width': 2.5 },
        });
      }
      const dotOpacity = (base: maplibregl.ExpressionSpecification): maplibregl.ExpressionSpecification => [
        'interpolate', ['linear'], ['zoom'],
        Z_DOTS_FADE[0], base,
        Z_DOTS_FADE[1], ['case', ['get', 'poly'], 0, base],
      ];
      map.addLayer({
        id: 'points', type: 'circle', source: 'points',
        // small dots on top of large ones
        layout: { 'circle-sort-key': ['-', 0, ['get', 'r']] },
        paint: {
          'circle-color': ['case', ['get', 'nodata'], '#bdbdb8', ['get', 'fill']],
          // winner share still shows as strength, but a dot never gets too faint to find
          'circle-opacity': dotOpacity(['max', ['get', 'op'], 0.55]),
          'circle-stroke-opacity': dotOpacity(['literal', 1]),
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6, ['*', ['get', 'r'], 0.8],
            8, ['*', ['get', 'r'], 1.05],
            10, ['*', ['get', 'r'], 1.45],
            12, ['*', ['get', 'r'], 1.9],
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 10, 1],
        },
      });
      map.addLayer({
        id: 'sel-points', type: 'circle', source: 'points', filter: ['==', ['get', 'id'], '__none__'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['+', ['*', ['get', 'r'], 0.8], 3], 12, ['+', ['*', ['get', 'r'], 1.9], 3]],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#111',
          'circle-stroke-width': 2.5,
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], Z_DOTS_FADE[0], 1, Z_DOTS_FADE[1], ['case', ['get', 'poly'], 0, 1]],
        },
      });
      applyTheme(map, latest.current.theme);
      setReady(true);
    });

    const pick = (pt: maplibregl.Point): { level: Level; id: string } | null => {
      const z = map.getZoom();
      // dots are small: hit-test them with a few pixels of slack (more for fingers)
      if (z < Z_DOTS_FADE[1]) {
        const s = COARSE ? 10 : 4;
        const near = map.queryRenderedFeatures([[pt.x - s, pt.y - s], [pt.x + s, pt.y + s]], { layers: ['points'] });
        const hit = near
          .filter((f) => z < Z_DOTS_FADE[0] || !f.properties.poly)
          .sort((a, b) => Number(a.properties.r) - Number(b.properties.r))[0];
        if (hit) return { level: 'locality', id: String(hit.properties.id) };
      }
      const layers = [
        'points',
        ...(z >= Z_AREAS ? ['areas-fill', 'areas-hatch'] : []),
        ...(z >= Z_LOCALITIES ? ['locs-fill', 'locs-hatch'] : []),
        'munis-fill',
        'munis-hatch',
      ];
      const fs: MapGeoJSONFeature[] = map.queryRenderedFeatures(pt, { layers });
      // queryRenderedFeatures returns top layer first
      for (const f of fs) {
        const id = String(f.properties.id);
        if (f.layer.id === 'points') {
          if (z >= Z_DOTS_FADE[0] && f.properties.poly) continue;
          return { level: 'locality', id };
        }
        if (f.layer.id.startsWith('areas')) return { level: 'area', id };
        if (f.layer.id.startsWith('locs')) {
          if (z >= Z_AREAS && f.properties.hasAreas) continue;
          return { level: 'locality', id };
        }
        if (f.layer.id.startsWith('munis')) return { level: 'municipality', id };
      }
      return null;
    };

    map.on('mousemove', (e) => {
      const p = pick(e.point);
      map.getCanvas().style.cursor = p ? 'pointer' : '';
      setHover(p ? { x: e.point.x, y: e.point.y, ...p } : null);
    });
    map.on('mouseout', () => setHover(null));
    map.on('click', (e) => {
      const p = pick(e.point);
      if (p) latest.current.onSelect({ ...p, fly: false });
      // no hover on touch screens: show the tooltip where the finger tapped
      if (COARSE) setHover(p ? { x: e.point.x, y: e.point.y, ...p } : null);
    });

    // Lazy-load neighborhood geometry (per city) and neighborhood results once zoomed in.
    const loadVisibleAreas = async () => {
      if (map.getZoom() < Z_AREAS - 1) return;
      const idx = latest.current.model.meta.areas_index ?? {};
      const visible = map.queryRenderedFeatures({ layers: ['locs-fill', 'locs-hatch'] });
      const cities = [...new Set(visible.map((f) => String(f.properties.id)))].filter(
        (c) => c in idx && !areaFeatures.current.has(c) && !loadingCities.current.has(c),
      );
      if (!cities.length) return;
      cities.forEach((c) => loadingCities.current.add(c));
      const m = latest.current.model;
      const [a25, a26] = await Promise.all([
        loadAreaResults('25'),
        m.r26 && m.meta.elections['26'].has_areas ? loadAreaResults('26') : Promise.resolve(null),
      ]);
      m.r25.areas = a25;
      if (m.r26) m.r26.areas = a26;
      const geos = await Promise.all(cities.map((c) => loadAreaGeo(c)));
      cities.forEach((c, i) => areaFeatures.current.set(c, geos[i]?.features ?? []));
      latest.current.onAreasLoaded();
    };
    map.on('moveend', loadVisibleAreas);

    return () => map.remove();
  }, []);

  // Repaint when data, options or loaded areas change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const withPaint = (fc: FC, level: Level, extra?: (id: string) => Record<string, unknown>): FC => ({
      type: 'FeatureCollection',
      features: fc.features.map((f) => {
        const id = String(f.properties.id);
        return { ...f, properties: { id, ...paintUnit(model, level, id, options), ...(extra?.(id) ?? {}) } };
      }),
    });
    const loaded = new Set(areaFeatures.current.keys());
    const shown = options.view === '25' ? model.r25 : (model.r26 ?? model.r25);
    const unitValid = (id: string) => shown.localities[id]?.valid || model.r25.localities[id]?.valid || 0;
    (map.getSource('munis') as GeoJSONSource).setData(withPaint(geo.municipalities, 'municipality'));
    (map.getSource('locs') as GeoJSONSource).setData(
      withPaint(geo.localities, 'locality', (id) => ({ hasAreas: loaded.has(id) && (areaFeatures.current.get(id)?.length ?? 0) > 0 })),
    );
    (map.getSource('areas') as GeoJSONSource).setData(
      withPaint({ type: 'FeatureCollection', features: [...areaFeatures.current.values()].flat() }, 'area'),
    );
    if (geo.noJurisdiction) (map.getSource('nojur') as GeoJSONSource).setData(geo.noJurisdiction);
    (map.getSource('points') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: geo.points.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          id: p.id,
          poly: p.poly,
          r: dotRadius(unitValid(p.id)),
          ...paintUnit(model, 'locality', p.id, options),
        },
      })),
    });
  }, [ready, model, geo, options, areasVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty('outline', 'visibility', outline ? 'visible' : 'none');
  }, [ready, outline]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyTheme(map, theme);
    map.updateImage('hatch', hatchImage(theme));
  }, [ready, theme]);

  // Highlight and fly to the selection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const none = '__none__';
    const sel = selection;
    const f = (lvl: Level) => ['==', ['get', 'id'], sel && sel.level === lvl ? sel.id : none] as maplibregl.FilterSpecification;
    map.setFilter('sel-munis', f('municipality'));
    map.setFilter('sel-locs', f('locality'));
    map.setFilter('sel-areas', f('area'));
    map.setFilter('sel-points', f('locality'));
    if (!sel || sel.level === 'national') return;
    let feats: FC['features'] = [];
    if (sel.level === 'municipality') feats = geo.municipalities.features.filter((x) => x.properties.id === sel.id);
    if (sel.level === 'locality') feats = geo.localities.features.filter((x) => x.properties.id === sel.id);
    if (sel.level === 'area') feats = [...areaFeatures.current.values()].flat().filter((x) => String(x.properties.id) === sel.id);
    const b = bbox(feats);
    const p = geo.points.find((x) => x.id === sel.id);
    const view = map.getBounds();
    if (b) {
      const inside = view.contains([b[0], b[1]]) && view.contains([b[2], b[3]]);
      if (!sel.fly && inside) return;
      const cam = map.cameraForBounds(b, { padding: 50, maxZoom: sel.level === 'area' ? 14 : 12.5 });
      if (!cam) return;
      // a city with neighborhoods opens at neighborhood zoom
      const hasAreas = sel.level === 'locality' && sel.id in (model.meta.areas_index ?? {});
      const zoom = Math.max(cam.zoom ?? 0, hasAreas ? Z_AREAS + 0.2 : sel.level === 'locality' ? Z_LOCALITIES + 0.6 : 0);
      map.flyTo({ center: cam.center, zoom, duration: 700 });
    } else if (p) {
      map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 10.5), duration: 600 });
    }
  }, [ready, selection, geo, model]);

  return (
    <div className="map-wrap">
      <div ref={ref} className="map" role="application" aria-label={he.mapLabel} />
      {hover && <Tooltip model={model} options={options} level={hover.level} id={hover.id} x={hover.x} y={hover.y} />}
    </div>
  );
}
