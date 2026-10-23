import { useState } from 'react';
import { he } from '../i18n/he';
import { fmtInt, fmtPct } from '../lib/format';
import { party, predecessorSeats, withdrawnLists, type Model } from '../lib/model';
import type { UnitRows } from '../lib/rows';
import { BallotChip } from './BallotChip';
import { SwingValue } from './SwingValue';

/** "אמת 3.7% + מרצ 3.2% = 6.9% → 8.1%" for a merger of two existing lists. */
// Each number is wrapped in a first-strong isolate (FSI…PDI) so bidi keeps the RTL order.
const iso = (s: string) => `⁨${s}⁩`;
function mergerDetail(parts: Record<string, number>, share26: number): string {
  const p = Object.entries(parts).map(([k, v]) => `${k} ${iso(fmtPct(v))}`).join(' + ');
  const sum = Object.values(parts).reduce((a, b) => a + b, 0);
  return `${p} = ${iso(fmtPct(sum))} ← ${iso(fmtPct(share26))}`;
}

function Seats({ n, delta }: { n: number | undefined; delta?: number | null }) {
  if (!n) {
    return (
      <span className="muted" title={he.summary.threshold}>
        —
      </span>
    );
  }
  return (
    <>
      <span className="seats">{n}</span>
      {delta ? (
        <span className={`seats-delta ${delta > 0 ? 'swing-up' : 'swing-down'}`} dir="ltr" title={he.unit.seatsChange}>
          ({delta > 0 ? '+' : '−'}
          {Math.abs(delta)})
        </span>
      ) : null}
    </>
  );
}

interface Props {
  model: Model;
  data: UnitRows;
  limit?: number;
  bars?: boolean;
  /** national seats of the shown election; null hides the column */
  seats?: Record<string, number> | null;
  /** 2022 seats, to show the change vs. predecessors in the comparison view */
  seats22?: Record<string, number> | null;
}

export function PartyTable({ model, data, limit = 12, bars = true, seats = null, seats22 = null }: Props) {
  const [all, setAll] = useState(false);
  const { rows, swing, election } = data;
  const max = rows[0]?.share ?? 1;
  const shown = all ? rows : rows.filter((r, i) => i < limit && (r.share >= 0.5 || i < 6));
  const compare = swing !== null;

  // Families (split successors) are summarized after their members.
  const famRows = compare && swing
    ? Object.entries(swing.families).filter(([, f]) => f.share26 !== null)
    : [];
  const deltaFor = (letters: string): number | null => {
    const prev = seats22 ? predecessorSeats(model, letters, seats22) : null;
    return prev === null ? null : (seats?.[letters] ?? 0) - prev;
  };
  const withdrawnFrom: Record<string, string> = Object.fromEntries(
    withdrawnLists(model).filter((p) => p.lineage?.from_k25).map((p) => [p.lineage!.from_k25!, p.short_name]),
  );
  const gone = compare && swing ? Object.entries(swing.gone).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="party-table-wrap">
      <table className="party-table">
        <thead>
          <tr>
            <th scope="col">{he.unit.list}</th>
            {seats && <th scope="col" className="num">{he.unit.seats}</th>}
            <th scope="col" className="num col-votes">{he.unit.votes}</th>
            <th scope="col" className="num">{he.unit.share}</th>
            {compare && <th scope="col" className="num">{he.unit.swing}</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.letters}>
              <th scope="row">
                <BallotChip model={model} election={election} letters={r.letters} size="sm" />
                {bars && (
                  <span className="bar" aria-hidden="true">
                    <span style={{ inlineSize: `${(r.share / max) * 100}%`, background: r.color }} />
                  </span>
                )}
              </th>
              {seats && (
                <td className="num">
                  <Seats n={seats[r.letters]} delta={seats22 && seats[r.letters] !== undefined ? deltaFor(r.letters) : null} />
                </td>
              )}
              <td className="num col-votes">{fmtInt(r.votes)}</td>
              <td className="num">{fmtPct(r.share)}</td>
              {compare && (
                <td className="num" title={r.parts22 ? mergerDetail(r.parts22, r.share) : undefined}>
                  {r.kind === 'split' ? (
                    <span className="muted">{he.badges.split(r.splitFrom ?? '')}</span>
                  ) : r.kind === 'new' ? (
                    <span className="badge badge-new">{he.badges.new}</span>
                  ) : (
                    <SwingValue value={r.swing} />
                  )}
                  {r.parts22 && <div className="merger-detail">{mergerDetail(r.parts22, r.share)}</div>}
                </td>
              )}
            </tr>
          ))}
          {famRows.map(([src, f]) => (
            <tr key={`fam-${src}`} className="family-row">
              <th scope="row">{he.unit.familyRow(f.members.map((l) => party(model, '26', l)?.short_name ?? l).join(' + '))}</th>
              {seats && (
                <td className="num">
                  <Seats
                    n={f.members.reduce((t, m) => t + (seats[m] ?? 0), 0)}
                    delta={seats22 ? f.members.reduce((t, m) => t + (seats[m] ?? 0), 0) - (seats22[src] ?? 0) : null}
                  />
                </td>
              )}
              <td className="num col-votes" />
              <td className="num">{fmtPct(f.share26)}</td>
              <td className="num" title={`${src} ${fmtPct(f.share22)} → ${fmtPct(f.share26)}`}>
                <SwingValue value={f.swing} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length || all ? (
        <button type="button" className="link-btn" onClick={() => setAll(!all)}>
          {all ? he.unit.showFewer : he.unit.showAll}
        </button>
      ) : null}
      {gone.length > 0 && (
        <details className="gone">
          <summary>
            {he.summary.notRunning} ({fmtPct(gone.reduce((t, [, v]) => t + v, 0))} ב-2022)
          </summary>
          <p className="muted">{he.summary.notRunningNote}</p>
          <ul>
            {gone.map(([k, v]) => (
              <li key={k}>
                <BallotChip model={model} election="25" letters={k} size="sm" showBadges={false} /> <span className="num">{fmtPct(v)}</span>
                {seats22?.[k] ? <span className="small"> · {he.summary.seatsOf(seats22[k])}</span> : null}
                {withdrawnFrom[k] && <span className="muted small"> · {he.summary.continuedAs(withdrawnFrom[k])}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
