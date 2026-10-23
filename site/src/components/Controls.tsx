import { he } from '../i18n/he';
import { swingTargets, type Model } from '../lib/model';
import type { ColorMode } from '../lib/types';

interface Props {
  model: Model;
  mode: ColorMode;
  onMode: (m: ColorMode) => void;
  swingTarget: string;
  onSwingTarget: (s: string) => void;
  blocTarget: string;
  onBlocTarget: (s: string) => void;
  canCompare: boolean;
  outline: boolean;
  onOutline: (b: boolean) => void;
}

export function Controls(p: Props) {
  const modes: { m: ColorMode; label: string; needs?: boolean }[] = [
    { m: 'winner', label: he.modes.winner },
    { m: 'partySwing', label: he.modes.partySwing, needs: true },
    { m: 'blocSwing', label: he.modes.blocSwing, needs: true },
    { m: 'turnout', label: he.modes.turnout },
  ];
  return (
    <fieldset className="controls">
      <legend>{he.modes.label}</legend>
      <div className="mode-list">
        {modes.map((x) => {
          const disabled = x.needs && !p.canCompare;
          return (
            <label key={x.m} className={disabled ? 'disabled' : ''} title={disabled ? he.modes.needsCompare : undefined}>
              <input type="radio" name="mode" value={x.m} checked={p.mode === x.m} disabled={disabled} onChange={() => p.onMode(x.m)} />
              {x.label}
            </label>
          );
        })}
      </div>
      {p.mode === 'partySwing' && (
        <label className="picker">
          {he.modes.party}
          <select value={p.swingTarget} onChange={(e) => p.onSwingTarget(e.target.value)}>
            {swingTargets(p.model).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {p.mode === 'blocSwing' && (
        <label className="picker">
          {he.modes.bloc}
          <select value={p.blocTarget} onChange={(e) => p.onBlocTarget(e.target.value)}>
            {p.model.blocs.order.map((b) => (
              <option key={b} value={b}>
                {p.model.blocs.items[b]?.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!p.canCompare && <p className="muted small">{he.modes.needsCompare}</p>}
      <label className="toggle">
        <input type="checkbox" checked={p.outline} onChange={(e) => p.onOutline(e.target.checked)} />
        {he.legend.outline}
      </label>
    </fieldset>
  );
}
