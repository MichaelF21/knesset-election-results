const int = new Intl.NumberFormat('he-IL');
const pct1 = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct2 = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' });

export const fmtInt = (n: number) => int.format(n);
export const fmtPct = (n: number | null | undefined, digits: 1 | 2 = 1) =>
  n === null || n === undefined ? '—' : `${(digits === 2 ? pct2 : pct1).format(n)}%`;
export const fmtNum1 = (n: number) => pct1.format(n);
/** Signed percentage points, e.g. "+1.2" / "−0.8" (true minus sign). */
export const fmtPP = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${pct1.format(Math.abs(n))}`;
export const fmtTime = (iso?: string) => (iso ? dateTime.format(new Date(iso)) : '');
