import { describe, expect, jest, test } from '@jest/globals';

jest.mock('../db/database', () => ({ getDb: () => { throw new Error('no db in tests'); } }));

// eslint-disable-next-line import/first
import { DEFAULT_SETTINGS } from '../lib/domain';
// eslint-disable-next-line import/first
import { HOME_SLOTS, catalog, defaultHomeTiles, packRows, resolveTiles, slotsUsed } from '../features/tiles';

const tile = (id: string, span: 1 | 2 = 1) => ({ id, span });

describe('tile grid', () => {
  test('packs in order, filling a gap left by a two-slot tile', () => {
    const rows = packRows([tile('a'), tile('cycle', 2), tile('b'), tile('c')], 2);
    expect(rows.map((r) => r.map((x) => x.id))).toEqual([['a', 'b'], ['cycle'], ['c']]);
  });

  test('four columns', () => {
    const rows = packRows([tile('a'), tile('b'), tile('cycle', 2), tile('c'), tile('d')], 4);
    expect(rows.map((r) => r.map((x) => x.id))).toEqual([['a', 'b', 'cycle'], ['c', 'd']]);
  });
});

describe('tile choice', () => {
  const defs = catalog({ ...DEFAULT_SETTINGS, cycleTracking: true }, []);

  test('cycle only when switched on', () => {
    expect(catalog(DEFAULT_SETTINGS, []).some((d) => d.id === 'cycle')).toBe(false);
    expect(defs.some((d) => d.id === 'cycle')).toBe(true);
  });

  test('respects the slot budget and drops unknown or duplicate tiles', () => {
    const ids = ['cycle', 'sleep', 'sleep', 'gone', 'water', 'meals', 'caffeine', 'activity', 'reflection', 'steps'];
    const out = resolveTiles(ids, defs, HOME_SLOTS).map((d) => d.id);
    expect(out).toEqual(['cycle', 'sleep', 'water', 'meals', 'caffeine', 'activity', 'reflection']);
    expect(slotsUsed(out, defs)).toBe(8);
  });

  test('defaults fill exactly the 8 slots', () => {
    expect(slotsUsed(defaultHomeTiles(DEFAULT_SETTINGS, catalog(DEFAULT_SETTINGS, [])), defs)).toBe(8);
    expect(defaultHomeTiles({ ...DEFAULT_SETTINGS, cycleTracking: true }, defs)).toContain('cycle');
  });
});
