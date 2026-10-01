import { describe, expect, test } from '@jest/globals';

import { CaffeineIntake, EnergyCheckIn, Meal, SleepLog } from '../lib/domain';
import { addDays, at, clockFromHour, dateRange, dayNumber, duration, fmtDate, hoursBetween, mondayOf } from '../lib/time';
import { generateDemo } from '../services/demo';
import { sleepTimes } from '../services/entries';
import { csvEscape } from '../services/export';
import { computeInsights } from '../services/insights';
import { DayRow, buildStreaks, pickNotableDays } from '../services/review';

// Pure logic only; database code is exercised on a device.

describe('time helpers', () => {
  test('hours between crosses midnight', () => {
    expect(hoursBetween('2026-09-30T23:30:00', '2026-10-01T06:30:00')).toBe(7);
  });
  test('at() rolls hours ≥ 24 into the next day', () => {
    expect(at('2026-09-30', 24.5)).toBe('2026-10-01T00:30:00');
  });
  test('duration and clock formatting', () => {
    expect(duration(6.98)).toBe('6h 59m');
    expect(duration(0.75)).toBe('45m');
    expect(clockFromHour(18 + 5.5)).toBe('23:30');
    expect(clockFromHour(18 + 12.5)).toBe('06:30');
  });
  test('date arithmetic', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(mondayOf('2026-10-01')).toBe('2026-09-28'); // a Thursday
    expect(dateRange('2026-09-29', '2026-10-01')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    expect(fmtDate('2026-10-01', 'ddd d MMM yyyy')).toBe('Thu 1 Oct 2026');
  });
});

describe('sleep times', () => {
  test('a bedtime later than the wake time was the evening before', () => {
    expect(sleepTimes({ wakeDate: '2026-10-01', bedTime: '23:30', wakeTime: '06:30' }))
      .toEqual({ bed: '2026-09-30T23:30:00', wake: '2026-10-01T06:30:00', hours: 7 });
  });
  test('after-midnight bedtime stays on the wake date', () => {
    expect(sleepTimes({ wakeDate: '2026-10-01', bedTime: '01:00', wakeTime: '08:00' }).hours).toBe(7);
  });
});

describe('csv escaping', () => {
  test('quotes commas, quotes and newlines', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });
  test('defuses spreadsheet formulas but keeps negative numbers', () => {
    expect(csvEscape('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvEscape('-5')).toBe('-5');
    expect(csvEscape(null)).toBe('');
  });
});

const base = { utcOffsetMinutes: 240, isSeed: false };
let n = 0;
const nextId = () => String(++n);
const sleep = (wakeDate: string, hours: number, quality = 3): SleepLog =>
  ({ ...base, id: nextId(), bedTime: at(addDays(wakeDate, -1), 30.5 - hours), wakeTime: `${wakeDate}T06:30:00`, quality, timesWoken: 0, notes: null });
const checkIn = (date: string, hour: number, energy: number, sleepiness = 3): EnergyCheckIn =>
  ({ ...base, id: nextId(), time: at(date, hour), energy, sleepiness, mood: 3, note: null });
const coffee = (date: string, hour: number): CaffeineIntake =>
  ({ ...base, id: nextId(), time: at(date, hour), type: 'Coffee', servings: 1, caffeineMg: 95 });
const breakfast = (date: string, skipped: boolean): Meal =>
  ({ ...base, id: nextId(), time: at(date, 7), mealType: 'Breakfast', description: skipped ? null : 'Oats', size: skipped ? null : 'Normal', skipped });

describe('insights', () => {
  const days = dateRange('2026-09-01', '2026-09-08');
  const sleeps = days.map((d, i) => sleep(d, i % 2 ? 5 : 8, i % 2 ? 2 : 4));
  const checkIns = days.flatMap((d, i) => [checkIn(d, 9, i % 2 ? 2 : 4, i % 2 ? 4 : 2), checkIn(d, 15, i % 2 ? 2 : 4)]);
  const caffeine = days.map((d, i) => coffee(d, i % 2 ? 17 : 9));
  const meals = days.map((d, i) => breakfast(d, i % 2 === 1));
  const report = computeInsights('2026-09-01', '2026-09-08', { sleeps, checkIns, caffeine, meals, activities: [], ratings: new Map() });

  test('summary and sleep stats', () => {
    expect(report.summary.daysLogged).toBe(8);
    expect(report.sleep.nights).toBe(8);
    expect(report.sleep.shortNights).toBe(4);
    expect(report.sleep.longNights).toBe(4);
    expect(report.sleepTakeaway.enough).toBe(true);
  });

  test('short nights vs long nights compares same-day energy', () => {
    const [short, , long] = report.sleepBuckets;
    expect(short.days).toBe(4);
    expect(short.a).toBe(2);
    expect(long.a).toBe(4);
    expect(report.sleepVsEnergyTakeaway.enough).toBe(true);
  });

  test('caffeine timing uses the following night', () => {
    const [early, , late] = report.caffeineBuckets;
    // Late caffeine on odd days is followed by the even (8h) night, and vice versa.
    expect(late.a).toBeCloseTo(8);
    expect(early.days + late.days).toBe(7); // the last day has no next night in the data
  });

  test('breakfast groups only count days where it was logged', () => {
    expect(report.breakfast[0].days + report.breakfast[1].days).toBe(8);
    expect(report.breakfast[1].a).toBe(2);
  });

  test('not enough data says so instead of guessing', () => {
    const empty = computeInsights('2026-09-01', '2026-09-03', { sleeps: [], checkIns: [], caffeine: [], meals: [], activities: [], ratings: new Map() });
    expect(empty.sleepTakeaway.enough).toBe(false);
    expect(empty.caffeineTakeaway.enough).toBe(false);
  });
});

const row = (date: string, p: Partial<DayRow>): DayRow => ({
  date, hasData: true, sleepHours: null, bedTime: null, wakeTime: null, sleepQuality: null, checkIns: 0,
  avgEnergy: null, avgSleepiness: null, avgMood: null, morningEnergy: null, caffeineDrinks: 0, caffeineMg: 0,
  lastCaffeine: null, mealsEaten: 0, mealsSkipped: 0, ateBreakfast: null, waterGlasses: 0, exerciseMinutes: 0,
  deepWorkMinutes: 0, screenTimeMinutes: 0, dayRating: null, reflection: null, ...p,
});

describe('streaks', () => {
  test('today not yet met does not break the current streak', () => {
    const days = [
      row('2026-09-28', { sleepHours: 7.5 }),
      row('2026-09-29', { sleepHours: 6 }),
      row('2026-09-30', { sleepHours: 7.2 }),
      row('2026-10-01', { sleepHours: 8, exerciseMinutes: 0 }),
    ];
    const sleepStreak = buildStreaks(days, '2026-10-01').find((s) => s.name === '7h+ sleep')!;
    expect(sleepStreak.current).toBe(2);
    expect(sleepStreak.longest).toBe(2);
    const exercise = buildStreaks(days, '2026-10-01').find((s) => s.name === 'Exercise')!;
    expect(exercise.current).toBe(0);
  });

  test('null days neither extend nor break a streak', () => {
    const days = [row('2026-09-29', { ateBreakfast: true }), row('2026-09-30', { ateBreakfast: null }), row('2026-10-01', { ateBreakfast: true })];
    expect(buildStreaks(days, '2026-10-02').find((s) => s.name === 'Breakfast')!.current).toBe(2);
  });

  test('best and hardest never share a day', () => {
    const days = [5, 4, 2, 1].map((r, i) => row(`2026-09-0${i + 1}`, { dayRating: r }));
    const { best, hardest } = pickNotableDays(days);
    expect(best.map((b) => b.day.dayRating)).toEqual([5, 4]);
    expect(hardest.map((b) => b.day.dayRating)).toEqual([1, 2]);
  });
});

describe('demo data', () => {
  test('is deterministic and flagged as demo', () => {
    const a = generateDemo(14, 42, '2026-10-01');
    const b = generateDemo(14, 42, '2026-10-01');
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(14 * 10);
    // Ids are unique, and one-per-day rows use their date-based ids.
    expect(new Set(a.map((r) => `${r.table}/${r.id}`)).size).toBe(a.length);
    expect(a.filter((r) => r.table === 'sleep_logs').every((r) => r.id.startsWith('s:'))).toBe(true);
    expect(a.filter((r) => r.table === 'daily_reflections').every((r) => r.id.startsWith('r:'))).toBe(true);
  });
});
