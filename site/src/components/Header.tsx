import { he } from '../i18n/he';
import { fmtNum1, fmtTime } from '../lib/format';
import type { Meta, View } from '../lib/types';

export function StatusChip({ meta, view }: { meta: Meta; view: View }) {
  const e = meta.elections[view === '25' ? '25' : '26'];
  const cls = e.status === 'final' ? 'chip-final' : e.status === 'partial' ? 'chip-partial' : 'chip-none';
  const text =
    e.status === 'final' ? he.status.final : e.status === 'partial' ? he.status.partial(fmtNum1(e.counted_pct ?? 0)) : he.status.notPublished;
  return (
    <span className={`chip ${cls}`} role="status">
      {text}
      {e.status === 'partial' && e.updated && <span className="chip-time"> · {he.status.updated(fmtTime(e.updated))}</span>}
    </span>
  );
}

export function Header({ meta, view, onView }: { meta: Meta; view: View; onView: (v: View) => void }) {
  const options: { v: View; label: string }[] = [
    { v: '25', label: he.election.k25 },
    { v: '26', label: he.election.k26 },
    { v: 'compare', label: he.election.compare },
  ];
  return (
    <header className="site-header">
      <h1>{he.title}</h1>
      <div className="header-row">
        <div className="segmented" role="radiogroup" aria-label={he.election.label}>
          {options.map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={view === o.v}
              tabIndex={view === o.v ? 0 : -1}
              className={view === o.v ? 'on' : ''}
              onClick={() => onView(o.v)}
              onKeyDown={(ev) => {
                const i = options.findIndex((x) => x.v === view);
                // RTL: ArrowLeft moves forward
                const d = ev.key === 'ArrowLeft' ? 1 : ev.key === 'ArrowRight' ? -1 : 0;
                if (d) {
                  ev.preventDefault();
                  const next = options[(i + d + options.length) % options.length];
                  onView(next.v);
                  (ev.currentTarget.parentElement?.querySelectorAll('button')[options.indexOf(next)] as HTMLButtonElement)?.focus();
                }
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <StatusChip meta={meta} view={view} />
      </div>
    </header>
  );
}
