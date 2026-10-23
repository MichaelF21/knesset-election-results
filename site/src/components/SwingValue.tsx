import { he } from '../i18n/he';
import { fmtNum1, fmtPP } from '../lib/format';

/** Party or bloc swing in percentage points, with an arrow. Same component for both. */
export function SwingValue({ value, compact = false }: { value: number | null | undefined; compact?: boolean }) {
  if (value === null || value === undefined) {
    return <span className="swing swing-none" title={he.swing.noComparison}>—</span>;
  }
  const dir = value > 0.05 ? 'up' : value < -0.05 ? 'down' : 'flat';
  const label = dir === 'up' ? he.swing.up(fmtNum1(value)) : dir === 'down' ? he.swing.down(fmtNum1(-value)) : he.swing.none;
  return (
    <span className={`swing swing-${dir}`} aria-label={label} title={label}>
      <span aria-hidden="true">{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●'}</span>
      {!compact || dir !== 'flat' ? (
        <span dir="ltr" aria-hidden="true">
          {dir === 'flat' ? fmtNum1(0) : fmtPP(value)}
        </span>
      ) : null}
    </span>
  );
}
