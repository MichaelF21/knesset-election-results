import { useEffect, useMemo, useState } from 'react';
import { Controls } from './components/Controls';
import { Header } from './components/Header';
import { Legend } from './components/Legend';
import { SearchBox } from './components/SearchBox';
import { SidePanel } from './components/SidePanel';
import { UnitTable } from './components/UnitTable';
import { he } from './i18n/he';
import { loadCore, loadGeo, type Geo } from './lib/data';
import { buildModel, type Model } from './lib/model';
import type { ColorMode, Selection, View } from './lib/types';
import { MapView } from './map/MapView';


function readHash(): Partial<{ view: View; mode: ColorMode; party: string; bloc: string; sel: Selection }> {
  const p = new URLSearchParams(location.hash.slice(1));
  const sel = p.get('s')?.split(':');
  return {
    view: (p.get('v') as View) || undefined,
    mode: (p.get('m') as ColorMode) || undefined,
    party: p.get('p') || undefined,
    bloc: p.get('b') || undefined,
    sel: sel && sel.length === 2 ? { level: sel[0] as Selection['level'], id: sel[1], fly: true } : undefined,
  };
}

export function App() {
  const [model, setModel] = useState<Model | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [error, setError] = useState(false);
  const init = useMemo(readHash, []);
  const [view, setView] = useState<View>(init.view ?? '25');
  const [mode, setMode] = useState<ColorMode>(init.mode ?? 'winner');
  const [swingTarget, setSwingTarget] = useState(init.party ?? 'מחל');
  const [blocTarget, setBlocTarget] = useState(init.bloc ?? 'coalition');
  const [selection, setSelection] = useState<Selection | null>(init.sel ?? null);
  const [table, setTable] = useState(false);
  const [outline, setOutline] = useState(false);
  const [areasVersion, setAreasVersion] = useState(0);

  useEffect(() => {
    Promise.all([loadCore(), loadGeo()])
      .then(([core, g]) => {
        if (!core.results['25']) throw new Error('no 2022 results');
        const m = buildModel(core.meta, core.parties, core.results['25'], core.results['26']);
        setModel(m);
        setGeo(g);
        if (!init.view) setView(m.r26 ? 'compare' : '25');
      })
      .catch((e) => {
        console.error(e);
        setError(true);
      });
  }, [init.view]);

  const canCompare = Boolean(model?.r26);
  useEffect(() => {
    if (!model) return;
    if (!canCompare && (view === 'compare' || mode === 'partySwing' || mode === 'blocSwing')) {
      if (view === 'compare') setView('25');
      if (mode !== 'winner' && mode !== 'turnout') setMode('winner');
    }
  }, [model, canCompare, view, mode]);

  useEffect(() => {
    const p = new URLSearchParams({ v: view, m: mode });
    if (mode === 'partySwing') p.set('p', swingTarget);
    if (mode === 'blocSwing') p.set('b', blocTarget);
    if (selection) p.set('s', `${selection.level}:${selection.id}`);
    history.replaceState(null, '', `#${p.toString()}`);
  }, [view, mode, swingTarget, blocTarget, selection]);

  const onMode = (m: ColorMode) => {
    setMode(m);
    if ((m === 'partySwing' || m === 'blocSwing') && view !== 'compare') setView('compare');
  };
  const onView = (v: View) => {
    setView(v);
    if (v !== 'compare' && (mode === 'partySwing' || mode === 'blocSwing')) setMode('winner');
  };

  const options = useMemo(() => ({ view, mode, swingTarget, blocTarget }), [view, mode, swingTarget, blocTarget]);

  if (error) return <p className="fatal">{he.loadError}</p>;
  if (!model || !geo) return <p className="loading">{he.loading}</p>;

  const notPublished = view !== '25' && !model.r26;
  const mock = model.meta.elections['26']?.mock;

  return (
    <div className="app">
      <a href="#main" className="skip">
        {he.skipToContent}
      </a>
      {mock && (
        <div className="mock-banner" role="alert">
          {he.mockBanner}
        </div>
      )}
      <Header meta={model.meta} view={view} onView={onView} />
      <main id="main" className="layout">
        <SidePanel model={model} view={notPublished ? '25' : view} selection={selection} onSelect={setSelection} />
        <section className="map-col" aria-label={he.modes.label}>
          <div className="toolbar">
            <SearchBox model={model} onSelect={setSelection} />
            <button type="button" className="btn" aria-pressed={table} onClick={() => setTable(!table)}>
              {table ? he.table.showMap : he.table.show}
            </button>
          </div>
          {notPublished ? (
            <div className="empty-state" role="status">
              <h2>{he.empty.title}</h2>
              <p>{he.empty.body}</p>
              <button type="button" className="btn" onClick={() => onView('25')}>
                {he.empty.show25}
              </button>
            </div>
          ) : (
            <>
              <Controls
                model={model}
                mode={mode}
                onMode={onMode}
                swingTarget={swingTarget}
                onSwingTarget={setSwingTarget}
                blocTarget={blocTarget}
                onBlocTarget={setBlocTarget}
                canCompare={canCompare}
                outline={outline}
                onOutline={setOutline}
              />
              {view === 'compare' && model.meta.elections['26'].status === 'partial' && <p className="note">{he.partialNote}</p>}
              {table ? (
                <UnitTable model={model} view={view} mode={mode} swingTarget={swingTarget} blocTarget={blocTarget} onSelect={setSelection} />
              ) : (
                <>
                  <MapView
                    model={model}
                    geo={geo}
                    options={options}
                    outline={outline}
                    selection={selection}
                    onSelect={setSelection}
                    areasVersion={areasVersion}
                    onAreasLoaded={() => setAreasVersion((v) => v + 1)}
                  />
                  <Legend model={model} view={view} mode={mode} />
                </>
              )}
            </>
          )}
        </section>
      </main>
      <footer className="site-footer">
        <p>{he.footer.sources}</p>
        <p>{he.footer.lineage}</p>
      </footer>
    </div>
  );
}
