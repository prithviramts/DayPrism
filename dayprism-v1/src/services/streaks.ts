import * as SecureStore from 'expo-secure-store';

import { getDb } from '../db/database';
import { DateOnly, addDays, daysBetween } from '../lib/time';

// The day streak: consecutive days on which you logged anything at all. Today is still in
// progress, so not having logged yet today doesn't break it ("log today to keep it going").

export interface StreakInfo {
  current: number;
  longest: number;
  loggedToday: boolean;
  /** First day of the current streak (to celebrate each milestone once per streak). */
  since: DateOnly | null;
  /** Days logged in the last 7 days, oldest first (for the little week strip). */
  lastSeven: { date: DateOnly; logged: boolean }[];
}

export const MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 1000] as const;

/** Pure: computes streaks from the set of days with any entry. */
export function computeStreak(days: Set<DateOnly>, today: DateOnly): StreakInfo {
  const loggedToday = days.has(today);
  let current = 0;
  let cursor = loggedToday ? today : addDays(today, -1);
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const since = current > 0 ? addDays(cursor, 1) : null;

  let longest = 0;
  let run = 0;
  let prev: DateOnly | null = null;
  for (const d of [...days].sort()) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  const lastSeven = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, logged: days.has(date) };
  });
  return { current, longest: Math.max(longest, current), loggedToday, since, lastSeven };
}

/** Days with any entry in the last ~400 days. */
export async function loggedDays(today: DateOnly): Promise<Set<DateOnly>> {
  const from = addDays(today, -400);
  const rows = await getDb().getAllAsync<{ d: string }>(
    `SELECT substr(time, 1, 10) AS d FROM energy_checkins WHERE deleted = 0 AND time >= ?1
     UNION SELECT substr(time, 1, 10) FROM meals WHERE deleted = 0 AND time >= ?1
     UNION SELECT substr(time, 1, 10) FROM caffeine_intakes WHERE deleted = 0 AND time >= ?1
     UNION SELECT substr(time, 1, 10) FROM water_intakes WHERE deleted = 0 AND time >= ?1
     UNION SELECT substr(wake_time, 1, 10) FROM sleep_logs WHERE deleted = 0 AND wake_time >= ?1
     UNION SELECT substr(start_time, 1, 10) FROM activities WHERE deleted = 0 AND start_time >= ?1 AND source IS NULL
     UNION SELECT date FROM daily_reflections WHERE deleted = 0 AND date >= ?1
     UNION SELECT substr(time, 1, 10) FROM tracker_entries WHERE deleted = 0 AND time >= ?1
     UNION SELECT date FROM cycle_days WHERE deleted = 0 AND date >= ?1`,
    from);
  return new Set(rows.map((r) => r.d));
}

export async function getStreak(today: DateOnly): Promise<StreakInfo> {
  return computeStreak(await loggedDays(today), today);
}

const CELEBRATED = 'dayprism.streak.celebrated';

/**
 * The milestone to celebrate now, if the current streak just reached one that hasn't been
 * celebrated during this streak. Marks it as celebrated.
 */
export async function milestoneToCelebrate(s: StreakInfo): Promise<number | null> {
  if (!s.since || !s.loggedToday) return null;
  const hit = [...MILESTONES].reverse().find((m) => s.current >= m);
  if (!hit) return null;
  const key = `${s.since}:${hit}`;
  const done = await SecureStore.getItemAsync(CELEBRATED).catch(() => null);
  if (done === key) return null;
  await SecureStore.setItemAsync(CELEBRATED, key);
  // Only celebrate on the day the milestone is actually reached, not when catching up later.
  return s.current === hit ? hit : null;
}
