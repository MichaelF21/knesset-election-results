import { he } from '../i18n/he';
import { party, results, type Model } from '../lib/model';
import { SWING_STOPS, swingColor, TURNOUT_RANGE, turnoutColor } from '../lib/scales';
import type { ColorMode, View } from '../lib/types';

export function Legend({ model, view, mode }: { model: Model; view: View; mode: ColorMode }) {
  const e = view === '25' ? '25' : '26';
  return (
    <div className="legend" aria-label={he.legend.title}>
      {mode === 'winner' && <WinnerLegend model={model} e={e} />}
      {(mode === 'partySwing' || mode === 'blocSwing') && (
        <div>
          <div className="ramp" aria-hidden="true">
            {SWING_STOPS.map((s) => (
              <span key={s} style={{ background: swingColor(s) }} />
            ))}
          </div>
          <div className="ramp-labels">
            {SWING_STOPS.filter((_, i) => i % 2 === 0).map((s) => (
              <span key={s} dir="ltr">
                {s === 0 ? '0' : `${s > 0 ? '+' : '−'}${Math.abs(s)}`}
              </span>
            ))}
          </div>
          <div className="legend-note">
            {he.legend.loss} ← {he.legend.swingUnit} → {he.legend.gain}
          </div>
        </div>
      )}
      {mode === 'turnout' && (
        <div>
          <div className="ramp" aria-hidden="true">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <span key={t} style={{ background: turnoutColor(TURNOUT_RANGE[0] + t * (TURNOUT_RANGE[1] - TURNOUT_RANGE[0])) }} />
            ))}
          </div>
          <div className="ramp-labels">
            <span>{TURNOUT_RANGE[0]}%</span>
            <span>{TURNOUT_RANGE[1]}%</span>
          </div>
          <div className="legend-note">{he.legend.turnoutUnit}</div>
        </div>
      )}
      <div className="legend-nodata">
        <span className="swatch hatch" aria-hidden="true" /> {he.legend.noData}
      </div>
    </div>
  );
}

function WinnerLegend({ model, e }: { model: Model; e: '25' | '26' }) {
  const r = results(model, e);
  if (!r) return null;
  const counts: Record<string, number> = {};
  for (const u of Object.values(r.localities)) if (u.winner) counts[u.winner] = (counts[u.winner] ?? 0) + 1;
  const top = Object.entries(counts)
    .sort((a, b) => (r.national.votes[b[0]] ?? 0) - (r.national.votes[a[0]] ?? 0))
    .slice(0, 12);
  return (
    <div>
      <ul className="legend-parties">
        {top.map(([l]) => (
          <li key={l}>
            <span className="swatch" style={{ background: party(model, e, l)?.color ?? model.parties.default_color }} aria-hidden="true" />
            {party(model, e, l)?.short_name ?? l}
          </li>
        ))}
      </ul>
      <div className="legend-note">{he.legend.winnerOpacity}</div>
    </div>
  );
}
