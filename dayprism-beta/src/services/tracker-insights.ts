import * as repo from '../db/repo';
import { Tracker, sleepHours } from '../lib/domain';
import { DateOnly, addDays, dateOf, dateRange, startOf } from '../lib/time';
import { MIN_DAYS_PER_GROUP, Takeaway, avg, hm } from './insights';
import { dailySeries, entriesIn, formatValue, listTrackers, metGoal } from './trackers';

// What each custom tracker seems to go along with. Same honesty rules as the other insights:
// comparisons between groups of your own days, the number of days behind each group, and
// "not enough data" below MIN_DAYS_PER_GROUP. Correlation, not proof.

export interface TrackerInsight {
  tracker: Tracker;
  /** Daily values for the chart (null = nothing logged that day). */
  days: { date: DateOnly; value: number | null }[];
  daysLogged: number;
  /** "3 of 30 days", "avg 2.4 drinks", "latest 72.4 kg". */
  summary: string;
  goalDays: { met: number; counted: number } | null;
  takeaway: Takeaway;
}

type Outcome = { label: string; byDay: Map<DateOnly, number>; fmt: (v: number) => string; better: 'higher' | 'lower' };

export async function buildTrackerInsights(from: DateOnly, to: DateOnly): Promise<TrackerInsight[]> {
  const trackers = await listTrackers(false);
  if (trackers.length === 0) return [];

  const start = startOf(from);
  const end = startOf(addDays(to, 1));
  const [entries, checkIns, sleeps, reflections] = await Promise.all([
    entriesIn(from, to),
    repo.checkInsIn(start, end),
    repo.sleepsWaking(start, startOf(addDays(to, 2))),
    repo.reflectionsIn(from, to),
  ]);

  // Outcomes we compare against.
  const energyByDay = new Map<DateOnly, number>();
  const grouped = new Map<DateOnly, number[]>();
  for (const c of checkIns) grouped.set(dateOf(c.time), [...(grouped.get(dateOf(c.time)) ?? []), c.energy]);
  for (const [d, v] of grouped) energyByDay.set(d, avg(v)!);
  // "That night" = the sleep you woke up from the next morning, keyed by the day before.
  const nightAfter = new Map<DateOnly, number>();
  for (const s of sleeps) nightAfter.set(addDays(dateOf(s.wakeTime), -1), sleepHours(s));
  const ratingByDay = new Map(reflections.map((r) => [r.date, r.dayRating]));

  const outcomes: Outcome[] = [
    { label: 'energy', byDay: energyByDay, fmt: (v) => v.toFixed(1), better: 'higher' },
    { label: 'that night\'s sleep', byDay: nightAfter, fmt: hm, better: 'higher' },
    { label: 'day rating', byDay: ratingByDay, fmt: (v) => v.toFixed(1), better: 'higher' },
  ];

  // Days you used the app at all: "no entry" only means "didn't happen" on those days.
  const activeDays = new Set<DateOnly>([...energyByDay.keys(), ...ratingByDay.keys(), ...entries.map((e) => dateOf(e.time))]);
  const series = dailySeries(trackers, entries);
  const days = dateRange(from, to);

  return trackers.map((t) => {
    const byDay = series.get(t.id)!;
    const values = [...byDay.values()];
    const daysLogged = byDay.size;

    let summary: string;
    if (t.kind === 'check') summary = `${daysLogged} of ${days.length} days`;
    else if (t.kind === 'measure') {
      const latest = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).at(-1);
      summary = latest ? `latest ${formatValue(t, latest[1])}` : 'nothing logged yet';
    } else summary = daysLogged ? `avg ${formatValue(t, avg(values)!)} on logged days` : 'nothing logged yet';

    let goalDays: TrackerInsight['goalDays'] = null;
    if (t.goal != null && t.goalDirection) {
      const counted = days.filter((d) => activeDays.has(d));
      goalDays = { met: counted.filter((d) => metGoal(t, byDay.get(d) ?? null) === true).length, counted: counted.length };
    }

    return {
      tracker: t,
      days: days.map((d) => ({ date: d, value: byDay.get(d) ?? null })),
      daysLogged,
      summary,
      goalDays,
      takeaway: compare(t, byDay, activeDays, outcomes),
    };
  });
}

/** Splits days into two groups for this tracker and finds the outcome that differs most. */
function compare(t: Tracker, byDay: Map<DateOnly, number>, activeDays: Set<DateOnly>, outcomes: Outcome[]): Takeaway {
  let groupA: (d: DateOnly) => boolean;
  let labels: [string, string];
  let pool: DateOnly[];

  if (t.kind === 'check' || t.kind === 'count') {
    // Days with it vs active days without it.
    pool = [...activeDays];
    groupA = (d) => (byDay.get(d) ?? 0) > 0;
    labels = t.kind === 'check' ? [`days with ${t.name.toLowerCase()}`, 'days without'] : [`days with any ${t.name.toLowerCase()}`, 'days with none'];
  } else {
    // Higher vs lower than your own median.
    pool = [...byDay.keys()];
    const sorted = pool.map((d) => byDay.get(d)!).sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    groupA = (d) => byDay.get(d)! > median;
    labels = [`days with higher ${t.name.toLowerCase()}`, 'lower days'];
  }

  let best: { text: string; diff: number } | null = null;
  let thin = true;
  for (const o of outcomes) {
    const a = pool.filter((d) => groupA(d) && o.byDay.has(d)).map((d) => o.byDay.get(d)!);
    const b = pool.filter((d) => !groupA(d) && o.byDay.has(d)).map((d) => o.byDay.get(d)!);
    if (a.length < MIN_DAYS_PER_GROUP || b.length < MIN_DAYS_PER_GROUP) continue;
    thin = false;
    const ma = avg(a)!;
    const mb = avg(b)!;
    // Normalise so different scales compare: hours of sleep vs 1–5 points.
    const scale = o.label.includes('sleep') ? 1 : 0.5;
    const diff = Math.abs(ma - mb) / scale;
    if (!best || diff > best.diff) {
      best = {
        diff,
        text: `On ${labels[0]}, ${o.label} averaged ${o.fmt(ma)} vs ${o.fmt(mb)} on ${labels[1]}. Based on ${a.length} and ${b.length} days.`,
      };
    }
  }

  if (thin || !best) {
    return {
      text: t.kind === 'check' || t.kind === 'count'
        ? `Log ${t.name.toLowerCase()} for a while (and check in) to see how days with and without it compare.`
        : `Log ${t.name.toLowerCase()} on a few more days to see what goes along with higher and lower values.`,
      enough: false,
    };
  }
  if (best.diff < 0.15) return { text: `${best.text} No clear difference so far.`, enough: true };
  return { text: best.text, enough: true };
}
