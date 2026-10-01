import { describe, expect, test } from '@jest/globals';

import type { CycleDay } from '../lib/domain';
import { addDays } from '../lib/time';
import { findPeriods, phaseOf, summarise } from '../services/cycle';

/** Bleeding days for a period starting on `start`, lasting `n` days. */
const period = (start: string, n: number, flow: CycleDay['flow'] = 'medium'): CycleDay[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c:${addDays(start, i)}`, date: addDays(start, i), flow, symptoms: [], note: null }));

describe('cycle tracking', () => {
  const days = [...period('2026-07-01', 5), ...period('2026-07-29', 4), ...period('2026-08-27', 5), ...period('2026-09-25', 5)];

  test('groups bleeding days into periods; spotting never starts one', () => {
    const withSpotting = [...days, { id: 'x', date: '2026-09-10', flow: 'spotting' as const, symptoms: [], note: null }];
    const ps = findPeriods(withSpotting);
    expect(ps.map((p) => p.start)).toEqual(['2026-07-01', '2026-07-29', '2026-08-27', '2026-09-25']);
    expect(ps[1].days).toBe(4);
  });

  test('a short gap inside one period does not split it', () => {
    const gappy = [...period('2026-07-01', 2), ...period('2026-07-04', 2)];
    expect(findPeriods(gappy)).toHaveLength(1);
  });

  test('averages, cycle day and next start come from the logs', () => {
    const s = summarise(days, '2026-10-04');
    expect(s.cyclesCounted).toBe(3);
    expect(s.avgCycle).toBe(29); // 28, 29, 29
    expect(s.cycleDay).toBe(10);
    expect(s.nextStart).toBe('2026-10-24');
    expect(s.onPeriod).toBe(false);
  });

  test('no prediction until one full cycle exists', () => {
    const s = summarise(period('2026-09-25', 5), '2026-10-04');
    expect(s.cycleDay).toBe(10);
    expect(s.nextStart).toBeNull();
  });

  test('phases: period, then follicular, then the 14 luteal days before the next period', () => {
    const ps = findPeriods(days);
    expect(phaseOf('2026-07-02', ps, 29, 5)).toBe('period');
    expect(phaseOf('2026-07-10', ps, 29, 5)).toBe('follicular');
    expect(phaseOf('2026-07-20', ps, 29, 5)).toBe('luteal');
    expect(phaseOf('2026-06-20', ps, 29, 5)).toBeNull();
  });
});
