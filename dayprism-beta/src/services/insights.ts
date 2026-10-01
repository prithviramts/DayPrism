import * as repo from '../db/repo';
import {
  ACTIVITY_CATEGORIES, Activity, ActivityCategory, ActivityFamily, CaffeineIntake, EnergyCheckIn, FAMILIES, Meal, SleepLog,
  activityName, familyOf, sleepHours,
} from '../lib/domain';
import {
  DateOnly, addDays, clockFromHour, dateOf, dateRange, duration, fmtDate, hourOfDay, hoursBetween,
  maxLocal, minLocal, mondayOf, nowLocal, showTime, startOf,
} from '../lib/time';

// Computes the Insights patterns from raw entries.
//
// A note on honesty: these are comparisons between groups of days, not proof of cause and
// effect, and a handful of days can swing an average a lot. So every comparison reports how
// many days it's based on, and says "not enough data" below MIN_DAYS_PER_GROUP.

export const MIN_DAYS_PER_GROUP = 2;

export interface Takeaway { text: string; enough: boolean }

/** Bed/wake are "hours after 18:00 the evening before" (23:30 = 5.5, 06:30 = 12.5), so nights average without the midnight wrap. */
export interface SleepNight { date: DateOnly; bed: number; wake: number; hours: number; quality: number }
export interface SleepStats { nights: number; avgHours: number | null; avgBedTime: string | null; avgWakeTime: string | null; avgQuality: number | null; shortNights: number; longNights: number }
export interface HourlyPoint { hour: number; energy: number; sleepiness: number; checkIns: number }
export interface Bucket { label: string; days: number; a: number | null; b: number | null }
export interface WeekActivity { weekStart: DateOnly; partial: boolean; byFamily: Record<ActivityFamily, number>; byCategory: Partial<Record<ActivityCategory, number>> }
export interface RatingPoint { date: DateOnly; rating: number | null; rolling: number | null }

export interface InsightsReport {
  from: DateOnly;
  to: DateOnly;
  summary: { daysLogged: number; avgSleepHours: number | null; avgEnergy: number | null; avgDayRating: number | null; avgCaffeineMg: number | null };
  nights: SleepNight[];
  sleep: SleepStats;
  sleepTakeaway: Takeaway;
  hourly: HourlyPoint[];
  hourlyTakeaway: Takeaway;
  /** a = energy, b = sleepiness */
  sleepBuckets: Bucket[];
  sleepVsEnergyTakeaway: Takeaway;
  /** a = sleep hours, b = quality */
  caffeineBuckets: Bucket[];
  caffeineTakeaway: Takeaway;
  /** a = morning energy */
  breakfast: Bucket[];
  breakfastTakeaway: Takeaway;
  weeks: WeekActivity[];
  activityTakeaway: Takeaway;
  ratings: RatingPoint[];
  ratingTakeaway: Takeaway;
}

export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const groupBy = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};
export const hm = (hours: number) => duration(hours);
const one = (n: number | null | undefined) => (n == null ? '–' : n.toFixed(1));
const signed = (v: number) => (v >= 0 ? `+${v.toFixed(1)}` : `−${Math.abs(v).toFixed(1)}`);

export async function buildInsights(from: DateOnly, to: DateOnly): Promise<InsightsReport> {
  const start = startOf(from);
  const end = startOf(addDays(to, 1));

  // Sleep extends one extra day: "caffeine vs that night's sleep" needs the night after the range.
  const [sleeps, checkIns, caffeine, meals, activities, reflections] = await Promise.all([
    repo.sleepsWaking(start, startOf(addDays(to, 2))),
    repo.checkInsIn(start, end),
    repo.caffeineIn(start, end),
    repo.mealsIn(start, end),
    repo.activitiesOverlapping(start, end),
    repo.reflectionsIn(from, to),
  ]);
  return computeInsights(from, to, { sleeps, checkIns, caffeine, meals, activities, ratings: new Map(reflections.map((r) => [r.date, r.dayRating])) });
}

export interface InsightsInput {
  sleeps: SleepLog[];
  checkIns: EnergyCheckIn[];
  caffeine: CaffeineIntake[];
  meals: Meal[];
  activities: Activity[];
  ratings: Map<DateOnly, number>;
}

/** Pure part, separate from loading so it can be tested. */
export function computeInsights(from: DateOnly, to: DateOnly, input: InsightsInput): InsightsReport {
  const { sleeps, checkIns, caffeine, meals, activities, ratings } = input;
  const days = dateRange(from, to);

  const sleepByWake = new Map<DateOnly, SleepLog>();
  for (const s of [...sleeps].sort((a, b) => (a.wakeTime < b.wakeTime ? -1 : 1))) sleepByWake.set(dateOf(s.wakeTime), s);
  const checkInsByDay = groupBy(checkIns, (c) => dateOf(c.time));
  const caffeineByDay = groupBy(caffeine, (c) => dateOf(c.time));
  const inRange = (d: DateOnly) => d >= from && d <= to;

  // ---- sleep
  const sixPm = (t: string, wakeDate: DateOnly) => hoursBetween(`${addDays(wakeDate, -1)}T18:00:00`, t);
  const nights: SleepNight[] = days.filter((d) => sleepByWake.has(d)).map((d) => {
    const s = sleepByWake.get(d)!;
    return { date: d, bed: sixPm(s.bedTime, d), wake: sixPm(s.wakeTime, d), hours: sleepHours(s), quality: s.quality };
  });
  const sleep: SleepStats = nights.length === 0
    ? { nights: 0, avgHours: null, avgBedTime: null, avgWakeTime: null, avgQuality: null, shortNights: 0, longNights: 0 }
    : {
      nights: nights.length,
      avgHours: avg(nights.map((n) => n.hours)),
      avgBedTime: clockFromHour(18 + avg(nights.map((n) => n.bed))!),
      avgWakeTime: clockFromHour(18 + avg(nights.map((n) => n.wake))!),
      avgQuality: avg(nights.map((n) => n.quality)),
      shortNights: nights.filter((n) => n.hours < 6).length,
      longNights: nights.filter((n) => n.hours >= 7).length,
    };
  const sleepTakeaway: Takeaway = sleep.nights < 3
    ? { text: 'Log at least 3 nights to see your sleep pattern.', enough: false }
    : {
      text: `You averaged ${hm(sleep.avgHours!)} a night, in bed around ${showTime(sleep.avgBedTime!)} and up around ${showTime(sleep.avgWakeTime!)}. `
        + `${sleep.shortNights} of ${sleep.nights} nights were under 6h; ${sleep.longNights} were 7h or more.`,
      enough: true,
    };

  // ---- energy by hour
  const hourly: HourlyPoint[] = [...groupBy(checkIns, (c) => String(Math.floor(hourOfDay(c.time)))).entries()]
    .map(([h, cs]) => ({ hour: Number(h), energy: avg(cs.map((c) => c.energy))!, sleepiness: avg(cs.map((c) => c.sleepiness))!, checkIns: cs.length }))
    .sort((a, b) => a.hour - b.hour);
  const solid = hourly.filter((h) => h.checkIns >= 3);
  const pad = (h: number) => showTime(`${String(h).padStart(2, '0')}:00`);
  let hourlyTakeaway: Takeaway = { text: 'Check in at different times of day to see your daily energy curve.', enough: false };
  if (solid.length >= 3) {
    const peak = solid.reduce((a, b) => (b.energy > a.energy ? b : a));
    const low = solid.reduce((a, b) => (b.energy < a.energy ? b : a));
    const sleepiest = solid.reduce((a, b) => (b.sleepiness > a.sleepiness ? b : a));
    hourlyTakeaway = {
      text: `Energy peaks around ${pad(peak.hour)} (${one(peak.energy)}) and is lowest around ${pad(low.hour)} (${one(low.energy)}). You feel sleepiest around ${pad(sleepiest.hour)}.`,
      enough: true,
    };
  }

  // ---- sleep vs same-day energy (one value per day, so 6 check-ins don't count 6 times)
  const sleepRows = days.filter((d) => sleepByWake.has(d) && checkInsByDay.has(d)).map((d) => {
    const h = sleepHours(sleepByWake.get(d)!);
    const cs = checkInsByDay.get(d)!;
    return { bucket: h < 6 ? 0 : h < 7 ? 1 : 2, energy: avg(cs.map((c) => c.energy))!, sleepiness: avg(cs.map((c) => c.sleepiness))! };
  });
  const sleepBuckets: Bucket[] = ['Under 6h', '6–7h', '7h+'].map((label, i) => {
    const g = sleepRows.filter((r) => r.bucket === i);
    return { label, days: g.length, a: avg(g.map((r) => r.energy)), b: avg(g.map((r) => r.sleepiness)) };
  });
  const [shortB, , longB] = sleepBuckets;
  const sleepVsEnergyTakeaway: Takeaway = shortB.days < MIN_DAYS_PER_GROUP || longB.days < MIN_DAYS_PER_GROUP
    ? { text: `Need ${MIN_DAYS_PER_GROUP}+ days after nights under 6h and after 7h+ to compare (have ${shortB.days} and ${longB.days}).`, enough: false }
    : {
      text: `After nights under 6h your energy averaged ${one(shortB.a)}, vs ${one(longB.a)} after 7h+ (${signed(shortB.a! - longB.a!)} points). `
        + `Sleepiness: ${one(shortB.b)} vs ${one(longB.b)}. Based on ${shortB.days} and ${longB.days} days.`,
      enough: true,
    };

  // ---- caffeine timing vs that night's sleep (the sleep you woke up from next morning)
  const cafPoints = days.filter((d) => caffeineByDay.has(d) && sleepByWake.has(addDays(d, 1))).map((d) => {
    const last = caffeineByDay.get(d)!.reduce((a, b) => (b.time > a.time ? b : a)).time;
    const night = sleepByWake.get(addDays(d, 1))!;
    const h = hourOfDay(last);
    return { bucket: h < 14 ? 0 : h < 16 ? 1 : 2, hours: sleepHours(night), quality: night.quality };
  });
  const caffeineBuckets: Bucket[] = ['Before 14:00', '14–16:00', 'After 16:00'].map((label, i) => {
    const g = cafPoints.filter((p) => p.bucket === i);
    return { label, days: g.length, a: avg(g.map((p) => p.hours)), b: avg(g.map((p) => p.quality)) };
  });
  const [early, , late] = caffeineBuckets;
  const caffeineTakeaway: Takeaway = early.days < MIN_DAYS_PER_GROUP || late.days < MIN_DAYS_PER_GROUP
    ? { text: `Need ${MIN_DAYS_PER_GROUP}+ days with your last caffeine before 14:00 and after 16:00 to compare (have ${early.days} and ${late.days}).`, enough: false }
    : {
      text: `When your last caffeine was after 16:00 you slept ${hm(late.a!)} (quality ${one(late.b)}), vs ${hm(early.a!)} (quality ${one(early.b)}) `
        + `when it was before 14:00. Based on ${late.days} and ${early.days} days.`,
      enough: true,
    };

  // ---- breakfast vs morning energy (only days where breakfast was logged either way)
  const breakfastByDay = groupBy(meals.filter((m) => m.mealType === 'Breakfast'), (m) => dateOf(m.time));
  const bRows = days
    .filter((d) => breakfastByDay.has(d) && (checkInsByDay.get(d) ?? []).some((c) => hourOfDay(c.time) < 12))
    .map((d) => ({
      skipped: breakfastByDay.get(d)!.every((m) => m.skipped),
      energy: avg(checkInsByDay.get(d)!.filter((c) => hourOfDay(c.time) < 12).map((c) => c.energy))!,
    }));
  const breakfast: Bucket[] = [['Ate breakfast', false], ['Skipped', true]].map(([label, skipped]) => {
    const g = bRows.filter((r) => r.skipped === skipped);
    return { label: label as string, days: g.length, a: avg(g.map((r) => r.energy)), b: null };
  });
  const [ate, skipped] = breakfast;
  const breakfastTakeaway: Takeaway = ate.days < MIN_DAYS_PER_GROUP || skipped.days < MIN_DAYS_PER_GROUP
    ? { text: `Need ${MIN_DAYS_PER_GROUP}+ logged days of both eating and skipping breakfast, with a morning check-in (have ${ate.days} and ${skipped.days}).`, enough: false }
    : {
      text: `Before noon your energy averaged ${one(skipped.a)} on days you skipped breakfast, vs ${one(ate.a)} when you ate `
        + `(${signed(skipped.a! - ate.a!)} points). Based on ${skipped.days} and ${ate.days} days.`,
      enough: true,
    };

  // ---- time per activity per week
  const now = nowLocal();
  const rangeStart = startOf(from);
  const rangeEnd = startOf(addDays(to, 1));
  const weeks: WeekActivity[] = [];
  for (let week = mondayOf(from); week <= to; week = addDays(week, 7)) {
    const ws = maxLocal(startOf(week), rangeStart);
    const we = minLocal(startOf(addDays(week, 7)), rangeEnd);
    const byCategory: Partial<Record<ActivityCategory, number>> = {};
    for (const a of activities) {
      // Only the part inside this week and range counts. A running activity counts up to now.
      const h = hoursBetween(maxLocal(a.startTime, ws), minLocal(a.endTime ?? now, we));
      if (h > 0) byCategory[a.category] = (byCategory[a.category] ?? 0) + h;
    }
    const byFamily = Object.fromEntries(FAMILIES.map((f) => [f.key, 0])) as Record<ActivityFamily, number>;
    for (const [c, h] of Object.entries(byCategory)) byFamily[familyOf(c as ActivityCategory)] += h!;
    weeks.push({ weekStart: week, partial: week < from || addDays(week, 6) > to, byFamily, byCategory });
  }
  const total = (w: WeekActivity) => Object.values(w.byCategory).reduce((a, b) => a + (b ?? 0), 0);
  const full = weeks.filter((w) => !w.partial && total(w) > 0);
  const pool = full.length ? full : weeks.filter((w) => total(w) > 0);
  let activityTakeaway: Takeaway = { text: 'Log activities to see where your time goes.', enough: false };
  if (pool.length) {
    const perWeek = ACTIVITY_CATEGORIES
      .map((c) => ({ c, h: pool.reduce((s, w) => s + (w.byCategory[c] ?? 0), 0) / pool.length }))
      .filter((x) => x.h > 0)
      .sort((a, b) => b.h - a.h);
    const top = perWeek.slice(0, 3).map((x) => `${activityName(x.c).toLowerCase()} ${x.h.toFixed(1)}h`).join(', ');
    const growth = perWeek.filter((x) => familyOf(x.c) === 'growth').reduce((s, x) => s + x.h, 0);
    const exercise = perWeek.find((x) => x.c === 'Exercise')?.h ?? 0;
    const basis = full.length ? `${full.length} full week${full.length === 1 ? '' : 's'}` : 'partial weeks only';
    activityTakeaway = {
      text: `In a typical week: ${top}. Study & projects: ${growth.toFixed(1)}h. Exercise: ${exercise.toFixed(1)}h. (${basis})`,
      enough: true,
    };
  }

  // ---- day rating, with a 7-day rolling average (needs 3 ratings in the window)
  const ratingPoints: RatingPoint[] = days.map((d) => {
    const window = [0, 1, 2, 3, 4, 5, 6].map((i) => ratings.get(addDays(d, -i))).filter((x): x is number => x != null);
    return { date: d, rating: ratings.get(d) ?? null, rolling: window.length >= 3 ? avg(window) : null };
  });
  const rated = ratingPoints.filter((r) => r.rating != null);
  let ratingTakeaway: Takeaway = { text: 'Write at least 3 end-of-day reflections to see your day-rating trend.', enough: false };
  if (rated.length >= 3) {
    const mean = avg(rated.map((r) => r.rating!))!;
    const max = Math.max(...rated.map((r) => r.rating!));
    const best = rated.filter((r) => r.rating === max).slice(0, 3).map((r) => fmtDate(r.date, 'ddd d MMM'));
    let text = `Average day rating ${one(mean)} over ${rated.length} rated days. Best: ${best.join(', ')}.`;
    if (rated.length >= 6) {
      const half = Math.floor(rated.length / 2);
      const first = avg(rated.slice(0, half).map((r) => r.rating!))!;
      const second = avg(rated.slice(rated.length - half).map((r) => r.rating!))!;
      const dir = Math.abs(second - first) < 0.25 ? 'steady' : second > first ? 'improving' : 'slipping';
      text += ` Trend: ${dir} (${one(first)} → ${one(second)}).`;
    }
    ratingTakeaway = { text, enough: true };
  }

  // ---- summary
  const logged = days.filter((d) =>
    checkInsByDay.has(d) || caffeineByDay.has(d) || sleepByWake.has(d) || ratings.has(d)
    || meals.some((m) => dateOf(m.time) === d) || activities.some((a) => dateOf(a.startTime) === d));
  const dayEnergies = days.filter((d) => checkInsByDay.has(d)).map((d) => avg(checkInsByDay.get(d)!.map((c) => c.energy))!);
  const ratingValues = [...ratings.entries()].filter(([d]) => inRange(d)).map(([, r]) => r);

  return {
    from, to,
    summary: {
      daysLogged: logged.length,
      avgSleepHours: avg(nights.map((n) => n.hours)),
      avgEnergy: avg(dayEnergies),
      avgDayRating: avg(ratingValues),
      avgCaffeineMg: logged.length ? caffeine.reduce((s, c) => s + c.caffeineMg, 0) / logged.length : null,
    },
    nights, sleep, sleepTakeaway,
    hourly, hourlyTakeaway,
    sleepBuckets, sleepVsEnergyTakeaway,
    caffeineBuckets, caffeineTakeaway,
    breakfast, breakfastTakeaway,
    weeks, activityTakeaway,
    ratings: ratingPoints, ratingTakeaway,
  };
}

