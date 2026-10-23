import { describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/swing_cases.json';
import { partySwingValue, unitSwing } from './swing';
import type { BlocDefs, LineageEntry } from './types';

const lineage = fixture.lineage as LineageEntry[];
const blocs: BlocDefs = { order: fixture.blocs.order, items: fixture.blocs.blocs as BlocDefs['items'] };

// Compare numbers to 2 decimals: Python rounds half-to-even, JS rounds half-up at the 3rd decimal.
function close(actual: unknown, expected: unknown, path = ''): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(actual as number, path).toBeCloseTo(expected, 2);
  } else if (expected === null || typeof expected !== 'object') {
    expect(actual, path).toEqual(expected);
  } else {
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const k of Object.keys(expected)) close((actual as never)[k], (expected as never)[k], `${path}.${k}`);
  }
}

describe('unitSwing matches pipeline/swing.py', () => {
  for (const [name, c] of Object.entries(fixture.cases)) {
    it(name, () => {
      const i = c.input as { v22: Record<string, number> | null; valid22: number; v26: Record<string, number> | null; valid26: number };
      close(unitSwing(i.v22, i.valid22, i.v26, i.valid26, lineage, blocs), c.expected);
    });
  }
});

describe('lineage rules', () => {
  const full = fixture.cases.full.input;
  const s = unitSwing(full.v22, full.valid22, full.v26, full.valid26, lineage, blocs);
  it('merger compares against the sum of predecessors', () => {
    expect(s.parties.M.share22).toBe(10);
    expect(s.parties.M.swing).toBe(2);
  });
  it('new list has no swing even when its letter existed in 2022', () => {
    expect(s.parties.Y.swing).toBeNull();
  });
  it('split successor reports its family swing', () => {
    expect(partySwingValue(s, 'S1')).toBe(3);
    expect(partySwingValue(s, 'family:J')).toBe(3);
  });
  it('withdrawn list is absent', () => {
    expect(s.parties.W).toBeUndefined();
  });
});
