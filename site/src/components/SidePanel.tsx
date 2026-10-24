import { he } from '../i18n/he';
import { fmtInt, fmtNum1, fmtPct } from '../lib/format';
import { breadcrumbs, nationalSeats, results, withdrawnLists, type Model } from '../lib/model';
import { BallotChip } from './BallotChip';
import { CandidateLists } from './CandidateLists';
import { unitRows } from '../lib/rows';
import type { Selection, View } from '../lib/types';
import { BlocTotals } from './BlocTotals';
import { PartyTable } from './PartyTable';
import { SeatChart } from './SeatChart';
import { UnitStats } from './UnitStats';

interface Props {
  model: Model;
  view: View;
  /** shown above the panel, e.g. that it shows 2022 results while 2026 has none yet */
  note?: string;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
}

export function SidePanel({ model, view, note, selection, onSelect }: Props) {
  const sel = selection ?? { level: 'national' as const, id: 'IL' };
  const data = unitRows(model, view, sel.level, sel.id);
  const crumbs = breadcrumbs(model, sel.level, sel.id);
  const e = data.election;
  const meta = model.meta.elections[e];
  const fallback = data.unit ?? unitRows(model, '25', sel.level, sel.id).unit;
  // the 2026 tab before any results: the running lists instead of numbers
  const awaiting = e === '26' && !model.r26;

  return (
    <aside className="panel" id="panel" aria-label={he.breadcrumbs}>
      {note && <p className="panel-note">{note}</p>}
      <nav aria-label={he.breadcrumbs} className="crumbs">
        <ol>
          {crumbs.map((c, i) => (
            <li key={`${c.level}:${c.id}`}>
              {i < crumbs.length - 1 ? (
                <button type="button" className="link-btn" onClick={() => onSelect(c.level === 'national' ? null : { level: c.level, id: c.id, fly: true })}>
                  {c.name}
                </button>
              ) : (
                <span aria-current="page">{c.name}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <h2 className="unit-title">{sel.level === 'national' ? he.levels.national : (fallback?.name ?? sel.id)}</h2>

      {awaiting ? (
        sel.level === 'national' ? (
          <>
            <p className="muted small">{he.lists.awaiting}</p>
            <SeatChart model={model} election="26" seats={{}} caption={he.lists.seatsPending} empty />
            <CandidateLists model={model} />
          </>
        ) : (
          <p className="muted">{he.status.notPublished}</p>
        )
      ) : !data.unit || !data.unit.valid ? (
        <p className="muted">{e === '26' && model.r26 ? he.unit.notCounted : he.unit.noResults}</p>
      ) : (
        <>
          <UnitStats unit={data.unit} />
          {data.unit.partial && <p className="note">{he.unit.partialUnit}</p>}
          {data.swing?.small_sample && (
            <p className="note warn" title={he.unit.smallSampleNote}>
              <strong>{he.unit.smallSample}</strong> · {he.unit.smallSampleNote}
            </p>
          )}
          {sel.level === 'locality' && model.meta.areas_index[sel.id] && (
            <p className="muted small">
              {he.unit.unplaced(fmtNum1(Math.max(0, 100 - model.meta.areas_index[sel.id].placed_share * 100)))}
            </p>
          )}
          {sel.level === 'national' && <National model={model} view={view} />}
          <section aria-labelledby="parties-h">
            <h3 id="parties-h">{he.summary.parties}</h3>
            <PartyTable
              model={model}
              data={data}
              seats={sel.level === 'national' ? nationalSeats(model, e) : null}
              seats22={sel.level === 'national' && view === 'compare' ? nationalSeats(model, '25') : null}
            />
          </section>
          <BlocTotals model={model} election={e} unit={data.unit} swing={data.swing} />
          {sel.level === 'municipality' && data.unit.localities && data.unit.localities.length > 1 && (
            <section>
              <h3>{he.unit.localities}</h3>
              <ul className="chips-list">
                {data.unit.localities.map((c) => (
                  <li key={c}>
                    <button type="button" className="link-btn" onClick={() => onSelect({ level: 'locality', id: c, fly: true })}>
                      {(results(model, e)?.localities[c] ?? model.r25.localities[c])?.name ?? c}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {sel.level === 'national' && meta.status === 'partial' && <p className="note">{he.partialNote}</p>}
    </aside>
  );
}

function National({ model, view }: { model: Model; view: View }) {
  const e = view === '25' ? '25' : '26';
  const r = results(model, e);
  if (!r) return null;
  const partial = model.meta.elections[e].status === 'partial';
  const seats = nationalSeats(model, e) ?? {};
  return (
    <>
      <SeatChart
        model={model}
        election={e}
        seats={seats}
        shares={Object.fromEntries(Object.entries(r.national.votes).map(([k, v]) => [k, (v / r.national.valid) * 100]))}
        caption={partial ? he.summary.seatsProjected : he.summary.seats}
      />
      {e === '26' && withdrawnLists(model).length > 0 && (
        <section className="withdrawn" aria-labelledby="withdrawn-h">
          <h3 id="withdrawn-h">{he.summary.withdrawn}</h3>
          <ul>
            {withdrawnLists(model).map((p) => (
              <li key={p.letters}>
                <BallotChip model={model} election="26" letters={p.letters} size="sm" />
              </li>
            ))}
          </ul>
          <p className="muted small">{he.summary.withdrawnNote}</p>
        </section>
      )}
      {r.external && r.external.valid > 0 && (
        <p className="external">
          <strong>{he.summary.external}:</strong> {fmtInt(r.external.valid)} {he.unit.valid} ({fmtPct((r.external.valid / r.national.valid) * 100)})
          <br />
          <span className="muted small">{he.summary.externalNote}</span>
        </p>
      )}
    </>
  );
}
