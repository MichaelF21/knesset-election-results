import { useEffect, useMemo, useState } from 'react';
import { he } from '../i18n/he';
import { loadAreaResults } from '../lib/data';
import { fmtInt, fmtPct } from '../lib/format';
import { compare, partyName, partySwingValue, results, type Model } from '../lib/model';
import type { ColorMode, Level, Selection, Unit, View } from '../lib/types';
import { SwingValue } from './SwingValue';

type Key = 'name' | 'valid' | 'turnout' | 'winner' | 'winner_share' | 'swing';

interface Props {
  model: Model;
  view: View;
  mode: ColorMode;
  swingTarget: string;
  blocTarget: string;
  onSelect: (s: Selection) => void;
}

/** Table alternative to the map ("הצג כטבלה"): every unit of a level, sortable. */
export function UnitTable({ model, view, mode, swingTarget, blocTarget, onSelect }: Props) {
  const [level, setLevel] = useState<Exclude<Level, 'national'>>('locality');
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'valid', dir: -1 });
  const [areasReady, setAreasReady] = useState(Boolean(model.r25.areas));
  const e = view === '25' ? '25' : '26';
  const showSwing = view === 'compare' && (mode === 'partySwing' || mode === 'blocSwing');

  useEffect(() => {
    if (level !== 'area' || areasReady) return;
    Promise.all([loadAreaResults('25'), model.r26 && model.meta.elections['26'].has_areas ? loadAreaResults('26') : null]).then(([a, b]) => {
      model.r25.areas = a;
      if (model.r26) model.r26.areas = b;
      setAreasReady(true);
    });
  }, [level, areasReady, model]);

  const rows = useMemo(() => {
    const r = results(model, e) ?? model.r25;
    const src: Record<string, Unit> =
      (level === 'municipality' ? r.municipalities : level === 'locality' ? r.localities : (r.areas ?? model.r25.areas)) ?? {};
    const out = Object.values(src).map((u) => {
      let swing: number | null = null;
      if (showSwing) {
        const s = compare(model, level, u.id);
        swing = s && s.comparable ? (mode === 'partySwing' ? partySwingValue(s, swingTarget) : (s.blocs[blocTarget]?.swing ?? null)) : null;
      }
      const city = level === 'area' && u.parent ? model.r25.localities[u.parent]?.name : undefined;
      return { u, swing, name: city ? `${u.name} (${city})` : u.name };
    });
    const val = (x: (typeof out)[number]): string | number => {
      switch (sort.key) {
        case 'name':
          return x.name;
        case 'winner':
          return x.u.winner ? partyName(model, e, x.u.winner) : '';
        case 'swing':
          return x.swing ?? -Infinity;
        default:
          return (x.u[sort.key] as number | null) ?? -Infinity;
      }
    };
    return out.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return (typeof va === 'string' ? va.localeCompare(vb as string, 'he') : va - (vb as number)) * sort.dir;
    });
  }, [model, e, level, sort, showSwing, mode, swingTarget, blocTarget, areasReady]);

  const head = (key: Key, label: string, num = true) => {
    const active = sort.key === key;
    return (
      <th scope="col" className={num ? 'num' : ''} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className="sort-btn"
          onClick={() => setSort({ key, dir: active ? (-sort.dir as 1 | -1) : key === 'name' ? 1 : -1 })}
          aria-label={`${label}: ${active && sort.dir === -1 ? he.table.sortAsc : he.table.sortDesc}`}
        >
          {label}
          <span aria-hidden="true">{active ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
        </button>
      </th>
    );
  };

  const levels: { l: Exclude<Level, 'national'>; label: string }[] = [
    { l: 'municipality', label: he.levels.municipalities },
    { l: 'locality', label: he.levels.localities },
    { l: 'area', label: he.levels.areas },
  ];

  return (
    <div className="unit-table">
      <div className="table-toolbar">
        <label>
          {he.table.level}{' '}
          <select value={level} onChange={(ev) => setLevel(ev.target.value as typeof level)}>
            {levels.map((x) => (
              <option key={x.l} value={x.l}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">{he.table.rows(fmtInt(rows.length))}</span>
      </div>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">{he.table.caption(levels.find((x) => x.l === level)!.label)}</caption>
          <thead>
            <tr>
              {head('name', he.table.name, false)}
              {head('valid', he.unit.valid)}
              {head('turnout', he.unit.turnout)}
              {head('winner', he.unit.winner, false)}
              {head('winner_share', he.unit.share)}
              {showSwing && head('swing', he.unit.swing)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ u, swing, name }) => (
              <tr key={u.id}>
                <th scope="row">
                  <button type="button" className="link-btn" onClick={() => onSelect({ level, id: u.id, fly: true })}>
                    {name}
                  </button>
                </th>
                <td className="num">{fmtInt(u.valid)}</td>
                <td className="num">{fmtPct(u.turnout)}</td>
                <td>{u.winner ? partyName(model, e, u.winner) : '—'}</td>
                <td className="num">{fmtPct(u.winner_share)}</td>
                {showSwing && (
                  <td className="num">
                    <SwingValue value={swing} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
