import { useState } from 'react';
import { he } from '../i18n/he';
import { fmtInt, fmtPct } from '../lib/format';
import { lineageNote, name22, party, predecessorSeats, withdrawnLists, type Model } from '../lib/model';
import type { UnitRows } from '../lib/rows';
import { BallotChip } from './BallotChip';
import { SwingValue } from './SwingValue';

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
      {delta ? ' ' : null}
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

const SHARE_BAR_PX = 64;

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
  const notes: Record<string, string | null> = Object.fromEntries(
    rows.map((r) => [r.letters, compare ? lineageNote(model, r.letters, swing?.parties[r.letters]) : null]),
  );
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
            <th scope="col" className="num share-cell">{he.unit.share}</th>
            {compare && <th scope="col" className="num">{he.unit.swing}</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.letters}>
              <th scope="row">
                <BallotChip model={model} election={election} letters={r.letters} size="sm" />
                {compare && notes[r.letters] && <span className="lineage-note">{notes[r.letters]}</span>}
              </th>
              {seats && (
                <td className="num">
                  <Seats n={seats[r.letters]} delta={seats22 && seats[r.letters] !== undefined ? deltaFor(r.letters) : null} />
                </td>
              )}
              <td className="num col-votes">{fmtInt(r.votes)}</td>
              <td className="num share-cell">
                {/* plain text first, so the share shows even if the bar can't be drawn; the bar has a
                    fixed pixel length (longest for the leading list) and needs no flexbox or % widths */}
                {fmtPct(r.share)}
                {bars && (
                  <span
                    className="share-bar"
                    aria-hidden="true"
                    style={{ width: `${Math.max(2, Math.round((r.share / max) * SHARE_BAR_PX))}px`, background: r.color }}
                  />
                )}
              </td>
              {compare && (
                <td className="num" title={notes[r.letters] ?? undefined}>
                  {/* split lists: the swing is on the family row; new lists: nothing to compare */}
                  <SwingValue value={r.kind === 'split' || r.kind === 'new' ? null : r.swing} />
                </td>
              )}
            </tr>
          ))}
          {famRows.map(([src, f]) => (
            <tr key={`fam-${src}`} className="family-row">
              <th scope="row" title={f.members.map((l) => party(model, '26', l)?.short_name ?? l).join(' + ')}>
                {he.unit.familyRow(name22(model, src))}
                <span className="lineage-note">{f.members.map((l) => party(model, '26', l)?.short_name ?? l).join(' + ')}</span>
              </th>
              {seats && (
                <td className="num">
                  <Seats
                    n={f.members.reduce((t, m) => t + (seats[m] ?? 0), 0)}
                    delta={seats22 ? f.members.reduce((t, m) => t + (seats[m] ?? 0), 0) - (seats22[src] ?? 0) : null}
                  />
                </td>
              )}
              <td className="num col-votes" />
              <td className="num share-cell">{fmtPct(f.share26)}</td>
              <td className="num" title={`${name22(model, src)} ${fmtPct(f.share22)} ← ${fmtPct(f.share26)}`}>
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
