import { getDb } from '../db/database';
import { DateOnly, addDays, addMonths, dateOf, dayOfWeek, firstWeekday, hoursBetween, startOf, today } from '../lib/time';

/** One cell of the month grid. */
export interface CalendarDay {
  date: DateOnly;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  hasData: boolean;
  dayRating: number | null;
  avgEnergy: number | null;
  sleepHours: number | null;
  /** A period day (light/medium/heavy flow logged). */
  period: boolean;
}

/**
 * The grid for a month: full weeks starting on the phone's first weekday (Sunday in the US,
 * Monday in most places), so it includes a few days of the neighbouring months (shown dimmed).
 */
export async function getMonth(firstOfMonth: DateOnly): Promise<CalendarDay[]> {
  const gridStart = addDays(firstOfMonth, -((dayOfWeek(firstOfMonth) - firstWeekday + 7) % 7));
  const last = addDays(addMonths(firstOfMonth, 1), -1);
  const gridEnd = addDays(last, ((firstWeekday + 6 - dayOfWeek(last)) % 7) + 1); // exclusive
  const from = startOf(gridStart);
  const to = startOf(gridEnd);
  const db = getDb();

  // A month of personal data is a few hundred rows, so load just the columns we need and group in memory.
  const [checkIns, sleeps, ratings, other, flows] = await Promise.all([
    db.getAllAsync<{ time: string; energy: number }>('SELECT time, energy FROM energy_checkins WHERE deleted = 0 AND time >= ? AND time < ?', from, to),
    db.getAllAsync<{ bed_time: string; wake_time: string }>('SELECT bed_time, wake_time FROM sleep_logs WHERE deleted = 0 AND wake_time >= ? AND wake_time < ?', from, to),
    db.getAllAsync<{ date: string; day_rating: number }>('SELECT date, day_rating FROM daily_reflections WHERE deleted = 0 AND date >= ? AND date < ?', gridStart, gridEnd),
    db.getAllAsync<{ t: string }>(
      `SELECT time AS t FROM meals WHERE deleted = 0 AND time >= ?1 AND time < ?2
       UNION ALL SELECT time FROM caffeine_intakes WHERE deleted = 0 AND time >= ?1 AND time < ?2
       UNION ALL SELECT time FROM water_intakes WHERE deleted = 0 AND time >= ?1 AND time < ?2
       UNION ALL SELECT start_time FROM activities WHERE deleted = 0 AND start_time >= ?1 AND start_time < ?2`, from, to),
    db.getAllAsync<{ date: string }>(
      "SELECT date FROM cycle_days WHERE deleted = 0 AND flow IN ('light', 'medium', 'heavy') AND date >= ? AND date < ?", gridStart, gridEnd),
  ]);
  const periodDays = new Set(flows.map((f) => f.date));

  const energy = new Map<string, number[]>();
  for (const c of checkIns) {
    const d = dateOf(c.time);
    energy.set(d, [...(energy.get(d) ?? []), c.energy]);
  }
  const sleepByDay = new Map(sleeps.map((s) => [dateOf(s.wake_time), hoursBetween(s.bed_time, s.wake_time)]));
  const ratingByDay = new Map(ratings.map((r) => [r.date, r.day_rating]));
  const withData = new Set<string>([
    ...other.map((o) => dateOf(o.t)), ...energy.keys(), ...sleepByDay.keys(), ...ratingByDay.keys(),
  ]);

  const t = today();
  const month = firstOfMonth.slice(0, 7);
  const days: CalendarDay[] = [];
  for (let d = gridStart; d < gridEnd; d = addDays(d, 1)) {
    const e = energy.get(d);
    days.push({
      date: d,
      inMonth: d.startsWith(month),
      isToday: d === t,
      isFuture: d > t,
      hasData: withData.has(d),
      dayRating: ratingByDay.get(d) ?? null,
      avgEnergy: e ? e.reduce((a, b) => a + b, 0) / e.length : null,
      sleepHours: sleepByDay.get(d) ?? null,
      period: periodDays.has(d),
    });
  }
  return days;
}
