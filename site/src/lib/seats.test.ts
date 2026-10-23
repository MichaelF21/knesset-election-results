import { describe, expect, it } from 'vitest';
import cases from '../../../tests/fixtures/seats_cases.json';
import { allocate } from './seats';

describe('allocate matches pipeline/seats.py', () => {
  for (const [name, c] of Object.entries(cases)) {
    it(name, () => {
      const seats = 'seats' in c ? (c.seats as number) : 120;
      expect(allocate(c.votes, c.agreements as [string, string][], seats)).toEqual(c.expected);
    });
  }

  it('2022 regression', () => {
    const s = allocate(cases.k25.votes, cases.k25.agreements as [string, string][]);
    const nonzero = Object.fromEntries(Object.entries(s).filter(([, v]) => v > 0));
    expect(nonzero).toEqual({ מחל: 32, פה: 24, ט: 14, כן: 12, שס: 11, ג: 7, ל: 6, עם: 5, ום: 5, אמת: 4 });
  });
});
