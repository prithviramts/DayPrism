import { UserSettings } from '../lib/domain';
import { DateOnly, addDays, dayOfWeek, firstWeekday, minLocal } from '../lib/time';
import { avg } from './insights';
import { DayRow, NotableDay, buildReview } from './review';

// "Your week": the week so far (or a past week) boiled down to a handful of numbers, each
// compared with the week before.

export const weekStart = (d: DateOnly): DateOnly => addDays(d, -((dayOfWeek(d) - firstWeekday + 7) % 7));

export interface WeekMetric {
  key: string;
  label: string;
  icon: string;
  value: number | null;
  previous: number | null;
  format: (v: number) => string;
  /** Which direction is good news, for colouring the change. */
  better: 'up' | 'down';
  /** e.g. "goal met 4 of 6 nights" */
  note?: string;
}

export interface WeekSummary {
  from: DateOnly;
  to: DateOnly;
  /** Days counted so far (fewer than 7 for the current week). */
  daysSoFar: number;
  daysLogged: number;
  metrics: WeekMetric[];
  best: NotableDay | null;
  days: DayRow[];
}

const round1 = (v: number) => v.toFixed(1);

export function summariseWeek(days: DayRow[], prev: DayRow[], s: UserSettings, today: DateOnly): Omit<WeekSummary, 'best'> {
  const past = days.filter((d) => d.date <= today);
  const mean = (rows: DayRow[], f: (d: DayRow) => number | null) => avg(rows.map(f).filter((x): x is number => x != null));
  const logged = (rows: DayRow[]) => rows.filter((d) => d.hasData);
  const count = (rows: DayRow[], f: (d: DayRow) => boolean) => rows.filter(f).length;

  const nights = past.filter((d) => d.sleepHours != null);
  const loggedDays = logged(past);

  const metrics: WeekMetric[] = [
    {
      key: 'sleep', label: 'Average sleep', icon: 'weather-night', better: 'up',
      value: mean(past, (d) => d.sleepHours), previous: mean(prev, (d) => d.sleepHours),
      format: (v) => `${Math.floor(v)}h ${String(Math.round((v % 1) * 60)).padStart(2, '0')}m`,
      note: nights.length ? `${s.sleepTargetHours}h goal met ${count(nights, (d) => d.sleepHours! >= s.sleepTargetHours)} of ${nights.length} nights` : undefined,
    },
    {
      key: 'energy', label: 'Average energy', icon: 'lightning-bolt', better: 'up',
      value: mean(past, (d) => d.avgEnergy), previous: mean(prev, (d) => d.avgEnergy), format: (v) => `${round1(v)} / 5`,
    },
    {
      key: 'mood', label: 'Average mood', icon: 'emoticon-happy-outline', better: 'up',
      value: mean(past, (d) => d.avgMood), previous: mean(prev, (d) => d.avgMood), format: (v) => `${round1(v)} / 5`,
    },
    {
      key: 'rating', label: 'Day rating', icon: 'star-outline', better: 'up',
      value: mean(past, (d) => d.dayRating), previous: mean(prev, (d) => d.dayRating), format: (v) => `${round1(v)} / 5`,
    },
    {
      key: 'water', label: 'Water a day', icon: 'water', better: 'up',
      value: mean(loggedDays, (d) => d.waterGlasses), previous: mean(logged(prev), (d) => d.waterGlasses),
      format: (v) => `${round1(v)} glasses`,
      note: loggedDays.length ? `${s.waterTargetGlasses}-glass goal met on ${count(loggedDays, (d) => d.waterGlasses >= s.waterTargetGlasses)} days` : undefined,
    },
    {
      key: 'caffeine', label: 'Caffeine a day', icon: 'coffee', better: 'down',
      value: mean(loggedDays, (d) => d.caffeineMg), previous: mean(logged(prev), (d) => d.caffeineMg),
      format: (v) => `${Math.round(v)} mg`,
      note: loggedDays.length ? `within ${s.caffeineLimitMg} mg on ${count(loggedDays, (d) => d.caffeineMg <= s.caffeineLimitMg)} of ${loggedDays.length} days` : undefined,
    },
    {
      key: 'exercise', label: 'Exercise', icon: 'run', better: 'up',
      value: past.length ? past.reduce((n, d) => n + d.exerciseMinutes, 0) : null,
      previous: prev.length ? prev.reduce((n, d) => n + d.exerciseMinutes, 0) : null,
      format: (v) => `${Math.round(v)} min`,
    },
  ];

  return {
    from: days[0].date, to: days[days.length - 1].date, daysSoFar: past.length, daysLogged: loggedDays.length,
    metrics: metrics.filter((m) => m.value != null || m.previous != null), days,
  };
}

export async function buildWeek(start: DateOnly, s: UserSettings, today: DateOnly): Promise<WeekSummary> {
  const end = addDays(start, 6);
  const [cur, prev] = await Promise.all([buildReview(start, end), buildReview(addDays(start, -7), addDays(start, -1))]);
  // For the week in progress, compare with the same days of last week, so Wednesday isn't
  // measured against a whole week.
  const elapsed = Math.min(7, cur.days.filter((d) => d.date <= minLocal(today, end)).length);
  const summary = summariseWeek(cur.days, prev.days.slice(0, Math.max(1, elapsed)), s, today);
  return { ...summary, best: cur.best[0] ?? null };
}
