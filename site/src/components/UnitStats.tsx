import { he } from '../i18n/he';
import { fmtInt, fmtPct } from '../lib/format';
import type { Unit } from '../lib/types';

export function UnitStats({ unit }: { unit: Unit }) {
  return (
    <dl className="stats">
      {unit.eligible > 0 && (
        <div>
          <dt>{he.unit.eligible}</dt>
          <dd>{fmtInt(unit.eligible)}</dd>
        </div>
      )}
      <div>
        <dt>{he.unit.voters}</dt>
        <dd>{fmtInt(unit.voters)}</dd>
      </div>
      {unit.turnout !== null && unit.eligible > 0 && (
        <div>
          <dt>{he.unit.turnout}</dt>
          <dd>{fmtPct(unit.turnout)}</dd>
        </div>
      )}
      <div>
        <dt>{he.unit.valid}</dt>
        <dd>{fmtInt(unit.valid)}</dd>
      </div>
    </dl>
  );
}
