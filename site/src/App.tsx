import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CandidateLists } from './components/CandidateLists';
import { Controls } from './components/Controls';
import { Header } from './components/Header';
import { Legend } from './components/Legend';
import { SearchBox } from './components/SearchBox';
import { SidePanel } from './components/SidePanel';
import { UnitTable } from './components/UnitTable';
import { he } from './i18n/he';
import { fetchMeta, loadCore, loadGeo, type Geo } from './lib/data';
import { fmtTime } from './lib/format';
import { buildModel, type Model } from './lib/model';
import { unitRows } from './lib/rows';
import { useTheme } from './lib/theme';
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
  const [theme, setTheme] = useTheme();
  const [toast, setToast] = useState<string | null>(null);
  // the visitor chose a tab: a live refresh must not switch it for them
  const pickedView = useRef(Boolean(init.view));
  const onAreasLoaded = useCallback(() => setAreasVersion((v) => v + 1), []);

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

  // Live updates: while 2026 results are not final, check meta.json and swap in new results in place.
  useEffect(() => {
    if (!model) return;
    const status = model.meta.elections['26']?.status;
    if (status === 'final') return;
    let busy = false;
    const check = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const meta = await fetchMeta();
        if (!meta || meta.generated === model.meta.generated) return;
        const core = await loadCore(meta);
        if (!core.results['25']) return;
        const m = buildModel(core.meta, core.parties, core.results['25'], core.results['26']);
        setModel(m);
        if (!model.r26 && m.r26 && !pickedView.current) setView('compare');
        setToast(he.refresh.updated(fmtTime(meta.elections['26']?.updated ?? meta.generated)));
      } catch {
        /* offline or mid-deploy: try again on the next tick */
      } finally {
        busy = false;
      }
    };
    // ?poll=<seconds> overrides the interval (rehearsals and tests)
    const custom = Number(new URLSearchParams(location.search).get('poll')) * 1000;
    const id = window.setInterval(check, custom || (status === 'partial' ? 60_000 : 120_000));
    const onVisible = () => !document.hidden && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [model]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const canCompare = Boolean(model?.r26);
  useEffect(() => {
    if (!model) return;
    // Without 2026 results the comparison view shows the not-published notice; swing modes reset.
    if (!canCompare && (mode === 'partySwing' || mode === 'blocSwing')) setMode('winner');
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
    pickedView.current = true;
    setView(v);
    if (v !== 'compare' && (mode === 'partySwing' || mode === 'blocSwing')) setMode('winner');
  };

  const options = useMemo(() => ({ view, mode, swingTarget, blocTarget, theme }), [view, mode, swingTarget, blocTarget, theme]);

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
      <Header meta={model.meta} view={view} onView={onView} theme={theme} onTheme={setTheme} />
      <main id="main" className="layout">
        <SidePanel
          model={model}
          view={notPublished ? '25' : view}
          note={notPublished ? he.empty.panelNote : undefined}
          selection={selection}
          onSelect={setSelection}
        />
        <section className="map-col" aria-label={he.modes.label}>
          <div className="toolbar">
            <SearchBox model={model} onSelect={setSelection} />
            <button type="button" className="btn" aria-pressed={table} onClick={() => setTable(!table)}>
              {table ? he.table.showMap : he.table.show}
            </button>
          </div>
          {notPublished ? (
            <>
              <div className={`empty-state${view === '26' ? ' compact' : ''}`} role="status">
                <h2>{he.empty.title}</h2>
                <p>
                  {view === 'compare' ? he.empty.compareBody : he.empty.body}
                  {view === '26' && ` ${he.empty.listsBelow}`}
                </p>
                <button type="button" className="btn" onClick={() => onView('25')}>
                  {he.empty.show25}
                </button>
              </div>
              {view === '26' && <CandidateLists model={model} />}
            </>
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
                    theme={theme}
                    geo={geo}
                    options={options}
                    outline={outline}
                    selection={selection}
                    onSelect={setSelection}
                    areasVersion={areasVersion}
                    onAreasLoaded={onAreasLoaded}
                  />
                  <Legend model={model} view={view} mode={mode} theme={theme} />
                  {selection && selection.level !== 'national' && (
                    <button
                      type="button"
                      className="btn to-details"
                      onClick={() => document.getElementById('panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    >
                      {he.toDetails(
                        unitRows(model, view, selection.level, selection.id).unit?.name ??
                          unitRows(model, '25', selection.level, selection.id).unit?.name ??
                          selection.id,
                      )}{' '}
                      <span aria-hidden="true">↓</span>
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </main>
      <div className="toast" role="status" aria-live="polite">
        {toast}
      </div>
      <footer className="site-footer">
        <p>{he.footer.sources}</p>
        <p>{he.footer.lineage}</p>
      </footer>
    </div>
  );
}
