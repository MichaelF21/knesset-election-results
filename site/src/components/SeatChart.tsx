import { he } from '../i18n/he';
import { party, type Model } from '../lib/model';
import type { ElectionKey } from '../lib/types';

/** Half-circle parliament chart: 120 seats in rows, parties ordered by bloc then size. */
export function SeatChart({ model, election, seats, caption }: { model: Model; election: ElectionKey; seats: Record<string, number>; caption: string }) {
  const order = model.blocs.order;
  const list = Object.entries(seats)
    .filter(([, n]) => n > 0)
    .map(([letters, n]) => ({ letters, n, p: party(model, election, letters) }))
    .sort((a, b) => order.indexOf(a.p?.bloc ?? 'others') - order.indexOf(b.p?.bloc ?? 'others') || b.n - a.n);
  const total = list.reduce((t, x) => t + x.n, 0);

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

  return (
    <figure className="seat-chart">
      <figcaption>{caption}</figcaption>
      <svg viewBox="0 0 220 116" role="img" aria-label={list.map((x) => `${x.p?.short_name ?? x.letters} ${x.n}`).join(', ')}>
        {pos.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.6} fill={colors[i]?.color ?? '#ddd'} className="seat-dot" strokeWidth={0.8}>
            <title>{colors[i] ? `${party(model, election, colors[i].letters)?.short_name ?? colors[i].letters}` : ''}</title>
          </circle>
        ))}
        <text x="110" y="104" textAnchor="middle" className="seat-total">
          {total}
        </text>
      </svg>
      <ul className="seat-legend">
        {list.map((x) => (
          <li key={x.letters}>
            <span className="dot" style={{ background: x.p?.color }} aria-hidden="true" />
            <span>{x.p?.short_name ?? x.letters}</span>
            <strong>{x.n}</strong>
          </li>
        ))}
      </ul>
      <p className="sr-only">{he.summary.seatsOf(total)}</p>
    </figure>
  );
}
