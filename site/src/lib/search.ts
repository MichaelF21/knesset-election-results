// Hebrew search normalization: final letters, hyphens/spaces, geresh and quotes.
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[֑-ׇ]/g, '') // niqqud and cantillation
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[׳'`’"”״]/g, '')
    .replace(/[-־–—_.,()]/g, ' ')
    .replace(/\s+/g, '')
    .replace(/קרית/g, 'קריית') // common spelling variant
    .toLowerCase();
}

export interface SearchItem {
  key: string;
  label: string;
  detail?: string;
  norm: string;
}

export function makeIndex<T extends { key: string; label: string; detail?: string }>(items: T[]): (T & { norm: string })[] {
  return items.map((it) => ({ ...it, norm: normalize(it.label) }));
}

export function search<T extends { norm: string; label: string }>(index: T[], query: string, limit = 12): T[] {
  const q = normalize(query);
  if (!q) return [];
  const starts: T[] = [];
  const contains: T[] = [];
  for (const it of index) {
    if (it.norm.startsWith(q)) starts.push(it);
    else if (it.norm.includes(q)) contains.push(it);
  }
  const byLen = (a: T, b: T) => a.label.length - b.label.length;
  return [...starts.sort(byLen), ...contains.sort(byLen)].slice(0, limit);
}
