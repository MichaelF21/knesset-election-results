import { he } from '../i18n/he';
import { fmtPct } from '../lib/format';
import { partyName } from '../lib/model';
import type { Model } from '../lib/model';
import { unitRows } from '../lib/rows';
import { partySwingValue } from '../lib/swing';
import type { Level } from '../lib/types';
import type { PaintOptions } from '../map/paint';
import { SwingValue } from './SwingValue';

const LEVEL: Record<Level, string> = {
  national: he.levels.national,
  municipality: he.levels.municipality,
  locality: he.levels.locality,
  area: he.levels.area,
};

export function Tooltip({ model, options, level, id, x, y }: { model: Model; options: PaintOptions; level: Level; id: string; x: number; y: number }) {
  const { unit, rows, swing, election } = unitRows(model, options.view, level, id);
  const fallbackName = unitRows(model, '25', level, id).unit?.name;
  const top = rows.slice(0, 3);
  return (
    <div className="tooltip" style={{ left: x > 300 ? x - 284 : x + 14, top: y + 14 }} role="status">
      <div className="tt-head">
        <strong>{unit?.name ?? fallbackName ?? id}</strong>
        <span className="tt-level">{LEVEL[level]}</span>
      </div>
      {!unit || !unit.valid ? (
        <div className="tt-muted">
          {election === '26' ? (model.r26 ? he.unit.notCounted : he.status.notPublished) : he.legend.noData}
        </div>
      ) : (
        <>
          {options.mode === 'partySwing' && swing && (
            <div className="tt-focus">
              {options.swingTarget.startsWith('family:') ? he.modes.partySwing : partyName(model, '26', options.swingTarget)}:{' '}
              <SwingValue value={partySwingValue(swing, options.swingTarget)} />
            </div>
          )}
          {options.mode === 'blocSwing' && swing && (
            <div className="tt-focus">
              {model.blocs.items[options.blocTarget]?.name}: <SwingValue value={swing.blocs[options.blocTarget]?.swing} />
            </div>
          )}
          {options.mode === 'turnout' && (
            <div className="tt-focus">
              {he.unit.turnout}: {fmtPct(unit.turnout)}
            </div>
          )}
          <table className="tt-table">
            <caption className="sr-only">{he.tooltip.top3}</caption>
            <tbody>
              {top.map((r) => (
                <tr key={r.letters}>
                  <td>
                    <span className="dot" style={{ background: r.color }} aria-hidden="true" />
                    {partyName(model, election, r.letters)}
                  </td>
                  <td className="num">{fmtPct(r.share)}</td>
                  {swing && (
                    <td className="num">
                      <SwingValue value={r.kind === 'split' ? null : r.swing} compact />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {swing?.small_sample && <div className="tt-warn">{he.unit.smallSample}</div>}
        </>
      )}
    </div>
  );
}
