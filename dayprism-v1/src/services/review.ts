import * as repo from '../db/repo';
import { DailyReflection, sleepHours } from '../lib/domain';
import {
  DateOnly, addDays, addMonths, dateRange, daysBetween, fmtDate, hhmm, hourOfDay, hoursBetween,
  maxLocal, minLocal, nowLocal, showTime, startOf, today,
} from '../lib/time';
import { InsightsReport, avg, computeInsights, hm } from './insights';

/** One day, boiled down to the numbers the review needs. */
export interface DayRow {
  date: DateOnly;
  hasData: boolean;
  sleepHours: number | null;
  bedTime: string | null;
  wakeTime: string | null;
  sleepQuality: number | null;
  checkIns: number;
  avgEnergy: number | null;
  avgSleepiness: number | null;
  avgMood: number | null;
  morningEnergy: number | null;
  caffeineDrinks: number;
  caffeineMg: number;
  /** "HH:mm" */
  lastCaffeine: string | null;
  mealsEaten: number;
  mealsSkipped: number;
  ateBreakfast: boolean | null;
  waterGlasses: number;
  exerciseMinutes: number;
  deepWorkMinutes: number;
  screenTimeMinutes: number;
  dayRating: number | null;
  reflection: DailyReflection | null;
}

export interface Streak {
  name: string;
  description: string;
  current: number;
  longest: number;
  longestFrom: DateOnly | null;
  longestTo: DateOnly | null;
  daysMet: number;
  daysCounted: number;
}

export interface NotableDay { day: DayRow; why: string }

export interface ReviewReport {
  from: DateOnly;
  to: DateOnly;
  today: DateOnly;
  insights: InsightsReport;
  days: DayRow[];
  best: NotableDay[];
  hardest: NotableDay[];
  streaks: Streak[];
  demoRows: number;
}

export const MAX_RANGE_DAYS = 366;
export const DEFAULT_RANGE_DAYS = 30;

export const daysLogged = (r: ReviewReport) => r.days.filter((d) => d.hasData).length;
export const avgOf = (r: ReviewReport, pick: (d: DayRow) => number | null) => avg(r.days.map(pick).filter((v): v is number => v != null));
/** Average over days with any data, for counts like water where "nothing" means 0. */
export const avgPerLoggedDay = (r: ReviewReport, pick: (d: DayRow) => number) => {
  const logged = r.days.filter((d) => d.hasData);
  return logged.length ? avg(logged.map(pick)) : null;
};

/** Quick picks shown above the review. */
export function presets(t: DateOnly = today()): { label: string; from: DateOnly; to: DateOnly }[] {
  const thisMonth = `${t.slice(0, 7)}-01`;
  const lastMonth = addMonths(thisMonth, -1);
  return [
    { label: '7 days', from: addDays(t, -6), to: t },
    { label: '30 days', from: addDays(t, -(DEFAULT_RANGE_DAYS - 1)), to: t },
    // Short month names so all four fit on one row of a phone screen.
    { label: fmtDate(thisMonth, 'MMM'), from: thisMonth, to: t },
    { label: fmtDate(lastMonth, 'MMM'), from: lastMonth, to: addDays(thisMonth, -1) },
  ];
}

export async function buildReview(from: DateOnly, to: DateOnly): Promise<ReviewReport> {
  const start = startOf(from);
  const end = startOf(addDays(to, 1));

  const [sleepsPlus, checkIns, caffeine, meals, water, activities, reflections] = await Promise.all([
    repo.sleepsWaking(start, startOf(addDays(to, 2))),
    repo.checkInsIn(start, end),
    repo.caffeineIn(start, end),
    repo.mealsIn(start, end),
    repo.waterIn(start, end),
    repo.activitiesOverlapping(start, end),
    repo.reflectionsIn(from, to),
  ]);
  const sleeps = sleepsPlus.filter((s) => s.wakeTime < end);

  const all = [...sleeps, ...checkIns, ...caffeine, ...meals, ...water, ...activities, ...reflections];
  const demoRows = all.filter((x) => x.isSeed).length;

  const now = nowLocal();
  const days: DayRow[] = dateRange(from, to).map((d) => {
    const ds = startOf(d);
    const de = startOf(addDays(d, 1));
    const on = (t: string) => t >= ds && t < de;

    const sleep = sleeps.filter((s) => on(s.wakeTime)).at(-1) ?? null;
    const dayCheckIns = checkIns.filter((c) => on(c.time));
    const morning = dayCheckIns.filter((c) => hourOfDay(c.time) < 12);
    const dayCaffeine = caffeine.filter((c) => on(c.time));
    const dayMeals = meals.filter((m) => on(m.time));
    const breakfasts = dayMeals.filter((m) => m.mealType === 'Breakfast');
    const reflection = reflections.find((r) => r.date === d) ?? null;
    const dayWater = water.filter((w) => on(w.time));

    // Minutes of a category inside this day (activities can cross midnight).
    const minutes = (category: string) => Math.round(activities
      .filter((a) => a.category === category)
      .reduce((s, a) => s + Math.max(0, hoursBetween(maxLocal(a.startTime, ds), minLocal(a.endTime ?? now, de)) * 60), 0));

    const hasData = !!sleep || dayCheckIns.length > 0 || dayCaffeine.length > 0 || dayMeals.length > 0
      || dayWater.length > 0 || !!reflection || activities.some((a) => on(a.startTime));
    const lastCaffeine = dayCaffeine.length ? dayCaffeine.reduce((a, b) => (b.time > a.time ? b : a)).time : null;

    return {
      date: d,
      hasData,
      sleepHours: sleep ? sleepHours(sleep) : null,
      bedTime: sleep ? hhmm(sleep.bedTime) : null,
      wakeTime: sleep ? hhmm(sleep.wakeTime) : null,
      sleepQuality: sleep?.quality ?? null,
      checkIns: dayCheckIns.length,
      avgEnergy: avg(dayCheckIns.map((c) => c.energy)),
      avgSleepiness: avg(dayCheckIns.map((c) => c.sleepiness)),
      avgMood: avg(dayCheckIns.map((c) => c.mood)),
      morningEnergy: avg(morning.map((c) => c.energy)),
      caffeineDrinks: dayCaffeine.length,
      caffeineMg: dayCaffeine.reduce((s, c) => s + c.caffeineMg, 0),
      lastCaffeine: lastCaffeine ? hhmm(lastCaffeine) : null,
      mealsEaten: dayMeals.filter((m) => !m.skipped).length,
      mealsSkipped: dayMeals.filter((m) => m.skipped).length,
      ateBreakfast: breakfasts.length ? breakfasts.some((m) => !m.skipped) : null,
      waterGlasses: dayWater.reduce((s, w) => s + w.glasses, 0),
      exerciseMinutes: minutes('Exercise'),
      deepWorkMinutes: minutes('DeepWork'),
      screenTimeMinutes: minutes('ScreenTime'),
      dayRating: reflection?.dayRating ?? null,
      reflection,
    };
  });

  const insights = computeInsights(from, to, {
    sleeps: sleepsPlus, checkIns, caffeine, meals, activities,
    ratings: new Map(reflections.map((r) => [r.date, r.dayRating])),
  });
  const { best, hardest } = pickNotableDays(days);
  const t = today();
  return { from, to, today: t, insights, days, best, hardest, streaks: buildStreaks(days, t), demoRows };
}

// ---------------------------------------------------------------- best & hardest days

/**
 * Ranks rated days by rating, then average energy. Takes up to 3 from each end, never the same
 * day twice (with only 4 rated days you get 2 best and 2 hardest).
 */
export function pickNotableDays(days: DayRow[]) {
  const rated = days.filter((d) => d.dayRating != null).sort((a, b) =>
    (b.dayRating! - a.dayRating!) || ((b.avgEnergy ?? 0) - (a.avgEnergy ?? 0)) || (a.date < b.date ? -1 : 1));
  const take = Math.min(3, Math.floor(rated.length / 2));
  return {
    best: rated.slice(0, take).map((d) => ({ day: d, why: why(d) })),
    hardest: [...rated].reverse().slice(0, take).map((d) => ({ day: d, why: why(d) })),
  };
}

function why(d: DayRow): string {
  const parts = [`rated ${d.dayRating}/5`];
  if (d.sleepHours != null) parts.push(`slept ${hm(d.sleepHours)}`);
  if (d.avgEnergy != null) parts.push(`energy ${d.avgEnergy.toFixed(1)}`);
  if (d.lastCaffeine) parts.push(`last caffeine ${showTime(d.lastCaffeine)}`);
  if (d.ateBreakfast === false) parts.push('skipped breakfast');
  if (d.exerciseMinutes > 0) parts.push(`exercised ${d.exerciseMinutes} min`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------- streaks

/** true = met, false = missed, null = doesn't apply that day (neither extends nor breaks a streak). */
const RULES: { name: string; description: string; met: (d: DayRow) => boolean | null }[] = [
  { name: 'Logging', description: 'days with at least one entry', met: (d) => d.hasData },
  { name: 'Reflection', description: 'days with a reflection', met: (d) => d.reflection != null },
  { name: '7h+ sleep', description: 'nights of 7 hours or more', met: (d) => (d.sleepHours == null ? null : d.sleepHours >= 7) },
  { name: 'Exercise', description: 'days with exercise', met: (d) => (d.hasData ? d.exerciseMinutes > 0 : null) },
  { name: 'Caffeine before 15:00', description: 'no caffeine after 15:00', met: (d) => (d.hasData ? d.lastCaffeine == null || d.lastCaffeine < '15:00' : null) },
  { name: 'Breakfast', description: 'days you ate breakfast', met: (d) => d.ateBreakfast },
];

export function buildStreaks(days: DayRow[], t: DateOnly): Streak[] {
  return RULES.map((rule) => {
    let longest = 0, run = 0;
    let runStart: DateOnly | null = null, longestFrom: DateOnly | null = null, longestTo: DateOnly | null = null;
    for (const d of days) {
      const met = rule.met(d);
      if (met === true) {
        runStart ??= d.date;
        run++;
        if (run > longest) [longest, longestFrom, longestTo] = [run, runStart, d.date];
      } else if (met === false) {
        run = 0;
        runStart = null;
      }
    }

    // Count back from the end. Today is still in progress, so not meeting the rule (yet) today doesn't break it.
    let current = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const met = rule.met(days[i]);
      if (met === true) current++;
      else if (met === false && !(days[i].date === t && i === days.length - 1)) break;
    }

    const counted = days.map(rule.met).filter((m) => m != null);
    return {
      name: rule.name, description: rule.description, current, longest, longestFrom, longestTo,
      daysMet: counted.filter((m) => m === true).length, daysCounted: counted.length,
    };
  });
}

export const rangeDays = (from: DateOnly, to: DateOnly) => daysBetween(from, to) + 1;
