import { describe, expect, it } from 'vitest';
import { makeIndex, normalize, search } from './search';

describe('normalize', () => {
  it('folds final letters', () => expect(normalize('ראשון')).toBe(normalize('ראשונ')));
  it('ignores hyphens and spaces', () => expect(normalize('תל אביב-יפו')).toBe(normalize('תל אביב יפו')));
  it('ignores geresh', () => expect(normalize("ג'לג'וליה")).toBe(normalize('גלגוליה')));
  it('treats קרית and קריית alike', () => expect(normalize('קרית שמונה')).toBe(normalize('קריית שמונה')));
});

describe('search', () => {
  const idx = makeIndex([
    { key: '1', label: 'תל אביב-יפו' },
    { key: '2', label: 'אביבים' },
    { key: '3', label: 'רמת אביב' },
  ]);
  it('prefix matches come first', () => {
    expect(search(idx, 'אביב').map((x) => x.key)).toEqual(['2', '3', '1']);
  });
  it('matches without the hyphen', () => {
    expect(search(idx, 'תל אביב יפו')[0].key).toBe('1');
  });
});
