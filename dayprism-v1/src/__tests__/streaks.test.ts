import { describe, expect, test } from '@jest/globals';

import { addDays } from '../lib/time';
import { computeStreak } from '../services/streaks';

const run = (end: string, n: number) => Array.from({ length: n }, (_, i) => addDays(end, -i));

describe('day streak', () => {
  test('counts back from today when today is logged', () => {
    const s = computeStreak(new Set(run('2026-10-05', 4)), '2026-10-05');
    expect(s.current).toBe(4);
    expect(s.loggedToday).toBe(true);
    expect(s.since).toBe('2026-10-02');
  });

  test('not logging yet today does not break it', () => {
    const s = computeStreak(new Set(run('2026-10-04', 3)), '2026-10-05');
    expect(s.current).toBe(3);
    expect(s.loggedToday).toBe(false);
  });

  test('a missed day yesterday ends it', () => {
    const s = computeStreak(new Set(run('2026-10-03', 5)), '2026-10-05');
    expect(s.current).toBe(0);
    expect(s.longest).toBe(5);
  });

  test('last seven days strip', () => {
    const s = computeStreak(new Set(['2026-10-05', '2026-10-01']), '2026-10-05');
    expect(s.lastSeven.map((d) => d.logged)).toEqual([false, false, true, false, false, false, true]);
  });
});
