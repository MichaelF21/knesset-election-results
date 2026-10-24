import { useState } from 'react';
import { he } from '../i18n/he';
import { fmtPct } from '../lib/format';
import { party, type Model } from '../lib/model';
import type { ElectionKey } from '../lib/types';

/**
 * Half-circle parliament chart: 120 seats in rows, parties ordered by bloc then size.
 * Pointing at a seat or a legend entry (or focusing / tapping it) highlights that party's seats.
 */
export function SeatChart({
  model,
  election,
  seats,
  caption,
  empty = false,
  shares = {},
}: {
  model: Model;
  election: ElectionKey;
  seats: Record<string, number>;
  caption: string;
  empty?: boolean;
  /** national vote share (%) per list, shown with the seats */
  shares?: Record<string, number>;
}) {
  const [active, setActive] = useState<string | null>(null);
  const order = model.blocs.order;
  const list = Object.entries(seats)
    .filter(([, n]) => n > 0)
    .map(([letters, n]) => ({ letters, n, p: party(model, election, letters) }))
    .sort((a, b) => order.indexOf(a.p?.bloc ?? 'others') - order.indexOf(b.p?.bloc ?? 'others') || b.n - a.n);
  // empty: 120 grey seats before any results
  const total = empty ? 120 : list.reduce((t, x) => t + x.n, 0);
  const current = list.find((x) => x.letters === active) ?? null;

  // Seat positions: rows of increasing radius, seats per row proportional to radius.
  const rows = 6;
  const r0 = 40;
  const r1 = 100;
  const radii = Array.from({ length: rows }, (_, i) => r0 + ((r1 - r0) * i) / (rows - 1));
  const sumR = radii.reduce((a, b) => a + b, 0);
  const perRow = radii.map((r) => Math.round((total * r) / sumR));
  perRow[rows - 1] += total - perRow.reduce((a, b) => a + b, 0);
  const pos: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, i) => {
    const n = perRow[i];
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? Math.PI / 2 : (Math.PI * k) / (n - 1);
      pos.push({ x: 110 + r * Math.cos(a), y: 108 - r * Math.sin(a), a });
    }
  });
  // RTL: fill from the right (angle 0) leftwards
  pos.sort((p, q) => p.a - q.a);
  const colors: { color: string; letters: string }[] = [];
  for (const x of list) for (let i = 0; i < x.n; i++) colors.push({ color: x.p?.color ?? model.parties.default_color, letters: x.letters });

  const point = (letters: string | null) => (empty ? undefined : () => setActive(letters));

  return (
    <figure className={`seat-chart${current ? ' has-active' : ''}`} onMouseLeave={() => setActive(null)}>
      <figcaption>{caption}</figcaption>
      <svg viewBox="0 0 220 116" role="img" aria-label={empty ? caption : list.map((x) => `${x.p?.short_name ?? x.letters} ${x.n}`).join(', ')}>
        {pos.map((p, i) => {
          const letters = colors[i]?.letters ?? null;
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3.6}
              fill={colors[i]?.color ?? 'var(--soft-2)'}
              className={`seat-dot${current && letters === active ? ' on' : ''}`}
              strokeWidth={0.8}
              onMouseEnter={point(letters)}
              onClick={point(letters === active ? null : letters)}
            >
              <title>
                {letters ? `${party(model, election, letters)?.short_name ?? letters} · ${fmtPct(shares[letters])}` : ''}
              </title>
            </circle>
          );
        })}
        <text x="110" y="104" textAnchor="middle" className="seat-total" style={current ? { fill: current.p?.color } : undefined}>
          {current ? current.n : total}
        </text>
      </svg>
      {!empty && (
        <p className="seat-active" aria-live="polite">
          {current ? (
            <>
              <span className="dot" style={{ background: current.p?.color }} aria-hidden="true" />
              {he.summary.seatHover(current.p?.short_name ?? current.letters, current.n, fmtPct(shares[current.letters]))}
            </>
          ) : (
            <span className="muted">{he.summary.seatHint}</span>
          )}
        </p>
      )}
      <ul className="seat-legend">
        {list.map((x) => (
          <li key={x.letters}>
            <button
              type="button"
              className={`seat-legend-item${x.letters === active ? ' on' : ''}`}
              onMouseEnter={point(x.letters)}
              onFocus={point(x.letters)}
              onBlur={point(null)}
              onClick={point(x.letters === active ? null : x.letters)}
              aria-pressed={x.letters === active}
            >
              <span className="dot" style={{ background: x.p?.color }} aria-hidden="true" />
              <span>{x.p?.short_name ?? x.letters}</span>
              <strong>{x.n}</strong>
              {shares[x.letters] !== undefined && <span className="seat-share">{fmtPct(shares[x.letters])}</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="sr-only">{he.summary.seatsOf(total)}</p>
    </figure>
  );
}
