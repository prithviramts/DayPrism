import { describe, expect, test } from '@jest/globals';

import type { Tracker, TrackerEntry } from '../lib/domain';
import { dayValue, formatValue, metGoal } from '../services/trackers';

const tracker = (p: Partial<Tracker>): Tracker => ({
  id: 't', name: 'Alcohol', kind: 'count', unit: 'drinks', icon: 'glass-wine', color: 'pink',
  goal: null, goalDirection: null, sortOrder: 0, archived: false, isSeed: false, ...p,
});
let n = 0;
const entry = (time: string, value: number): TrackerEntry =>
  ({ id: String(++n), trackerId: 't', time, value, note: null, utcOffsetMinutes: 240, isSeed: false });

describe('day value per kind', () => {
  const es = [entry('2026-10-02T09:00:00', 2), entry('2026-10-02T21:00:00', 4)];
  test('count sums, scale averages, measure takes the latest, check is done', () => {
    expect(dayValue('count', es)).toBe(6);
    expect(dayValue('scale', es)).toBe(3);
    expect(dayValue('measure', es)).toBe(4);
    expect(dayValue('check', es)).toBe(1);
    expect(dayValue('count', [])).toBeNull();
  });
});

describe('goals', () => {
  test('at most: nothing logged counts as met', () => {
    const t = tracker({ goal: 2, goalDirection: 'at_most' });
    expect(metGoal(t, null)).toBe(true);
    expect(metGoal(t, 2)).toBe(true);
    expect(metGoal(t, 3)).toBe(false);
  });
  test('at least: nothing logged counts as missed', () => {
    const t = tracker({ goal: 20, goalDirection: 'at_least', unit: 'pages' });
    expect(metGoal(t, null)).toBe(false);
    expect(metGoal(t, 25)).toBe(true);
  });
  test('no goal means no judgement', () => {
    expect(metGoal(tracker({}), 5)).toBeNull();
  });
});

describe('formatting', () => {
  test('values read naturally per kind', () => {
    expect(formatValue(tracker({}), 3)).toBe('3 drinks');
    expect(formatValue(tracker({ kind: 'scale', unit: null }), 2.5)).toBe('2.5/5');
    expect(formatValue(tracker({ kind: 'check', unit: null }), 1)).toBe('Done');
    expect(formatValue(tracker({ kind: 'check', unit: null }), null)).toBe('Not yet');
    expect(formatValue(tracker({ kind: 'measure', unit: 'kg' }), 72.44)).toBe('72.4 kg');
  });
});
