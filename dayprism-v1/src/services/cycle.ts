import { getDb } from '../db/database';
import { stamp } from '../db/schema';
import { CycleDay, Flow } from '../lib/domain';
import { DateOnly, addDays, daysBetween } from '../lib/time';
import { localChanged } from '../sync/signal';

// Cycle tracking. Everything here is learned from the user's own logs; nothing is assumed
// except a 28-day / 5-day starting point that is replaced as soon as real cycles exist.
// Predictions are estimates for planning, never contraception or medical advice.

const DEFAULT_CYCLE = 28;
const DEFAULT_PERIOD = 5;
/** Cycles outside this range are almost always a missed log, so they don't skew the average. */
const MIN_CYCLE = 15;
const MAX_CYCLE = 60;
/** A new period starts after this many days with no bleeding (spotting doesn't count). */
const GAP_DAYS = 3;
/** How many recent cycles the averages use. */
const RECENT = 6;

type Row = Record<string, any>;

const mapDay = (r: Row): CycleDay => ({
  id: r.id, date: r.date, flow: r.flow, note: r.note,
  symptoms: r.symptoms ? String(r.symptoms).split(',').filter(Boolean) : [],
});

export async function cycleDaysIn(from: DateOnly, to: DateOnly): Promise<CycleDay[]> {
  const rows = await getDb().getAllAsync<Row>(
    'SELECT * FROM cycle_days WHERE deleted = 0 AND date >= ? AND date <= ? ORDER BY date', from, to);
  return rows.map(mapDay);
}

export async function cycleDay(date: DateOnly): Promise<CycleDay | null> {
  const r = await getDb().getFirstAsync<Row>('SELECT * FROM cycle_days WHERE deleted = 0 AND id = ?', `c:${date}`);
  return r ? mapDay(r) : null;
}

/** Saves a day; clearing flow, symptoms and note deletes it. */
export async function saveCycleDay(date: DateOnly, flow: Flow | null, symptoms: string[], note: string | null): Promise<void> {
  const id = `c:${date}`;
  const empty = !flow && symptoms.length === 0 && !note?.trim();
  if (empty) {
    await getDb().runAsync('UPDATE cycle_days SET deleted = 1, dirty = 1, client_updated_at = ? WHERE id = ?', stamp(), id);
  } else {
    await getDb().runAsync(
      `INSERT INTO cycle_days (id, date, flow, symptoms, note, dirty, client_updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET flow = excluded.flow, symptoms = excluded.symptoms, note = excluded.note,
         deleted = 0, dirty = 1, client_updated_at = excluded.client_updated_at`,
      id, date, flow, symptoms.join(','), note?.trim() || null, stamp());
  }
  localChanged();
}

// ---------------------------------------------------------------- pure analysis

const bleeding = (d: CycleDay) => d.flow === 'light' || d.flow === 'medium' || d.flow === 'heavy';

export interface Period { start: DateOnly; end: DateOnly; days: number }

/** Groups bleeding days into periods: a gap of GAP_DAYS+ days without bleeding starts a new one. */
export function findPeriods(days: CycleDay[]): Period[] {
  const dates = days.filter(bleeding).map((d) => d.date).sort();
  const periods: Period[] = [];
  for (const d of dates) {
    const last = periods.at(-1);
    if (last && daysBetween(last.end, d) <= GAP_DAYS) {
      last.end = d;
      last.days = daysBetween(last.start, d) + 1;
    } else {
      periods.push({ start: d, end: d, days: 1 });
    }
  }
  return periods;
}

export interface CycleSummary {
  periods: Period[];
  /** Completed cycles used for the averages. */
  cyclesCounted: number;
  avgCycle: number;
  avgPeriod: number;
  /** Day of the current cycle (1 = first day of the latest period), or null with no period logged. */
  cycleDay: number | null;
  /** Expected start of the next period, only once at least one full cycle is known. */
  nextStart: DateOnly | null;
  /** True while today is inside the latest logged period. */
  onPeriod: boolean;
  /** Cycle lengths vary a lot (more than 7 days between shortest and longest recent cycle). */
  irregular: boolean;
}

export function summarise(days: CycleDay[], today: DateOnly): CycleSummary {
  const periods = findPeriods(days).filter((p) => p.start <= today);
  const lengths = periods.slice(1).map((p, i) => daysBetween(periods[i].start, p.start))
    .filter((n) => n >= MIN_CYCLE && n <= MAX_CYCLE).slice(-RECENT);
  const avgCycle = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : DEFAULT_CYCLE;
  const recentPeriods = periods.slice(-RECENT).filter((p, i, arr) => i < arr.length - 1 || p.end < today);
  const avgPeriod = recentPeriods.length
    ? Math.round(recentPeriods.reduce((a, p) => a + p.days, 0) / recentPeriods.length)
    : DEFAULT_PERIOD;

  const last = periods.at(-1);
  const cycleDay = last ? daysBetween(last.start, today) + 1 : null;
  let nextStart: DateOnly | null = null;
  if (last && lengths.length > 0) {
    nextStart = addDays(last.start, avgCycle);
    // If the predicted day has passed without a log, the period is late: show today, not the past.
    while (nextStart < today && daysBetween(nextStart, today) > MAX_CYCLE) nextStart = addDays(nextStart, avgCycle);
  }
  const onPeriod = !!last && daysBetween(last.end, today) <= 1 && today >= last.start && daysBetween(last.start, today) < 10;
  const irregular = lengths.length >= 3 && Math.max(...lengths) - Math.min(...lengths) > 7;

  return { periods, cyclesCounted: lengths.length, avgCycle, avgPeriod, cycleDay, nextStart, onPeriod, irregular };
}

export type Phase = 'period' | 'follicular' | 'luteal';

/**
 * Phase of a date given the periods around it. Luteal = the ~14 days before the next period
 * (the most consistent part of the cycle); follicular = between the period and that.
 */
export function phaseOf(date: DateOnly, periods: Period[], avgCycle: number, avgPeriod: number): Phase | null {
  const start = [...periods].reverse().find((p) => p.start <= date);
  if (!start) return null;
  const day = daysBetween(start.start, date) + 1;
  if (day > MAX_CYCLE) return null;
  const nextIndex = periods.indexOf(start) + 1;
  const length = nextIndex < periods.length ? daysBetween(start.start, periods[nextIndex].start) : avgCycle;
  if (day <= Math.max(start.days, nextIndex < periods.length ? start.days : avgPeriod)) return 'period';
  if (day > length - 14) return 'luteal';
  return 'follicular';
}

export const PHASE_LABEL: Record<Phase, string> = { period: 'Period', follicular: 'Follicular', luteal: 'Luteal' };
