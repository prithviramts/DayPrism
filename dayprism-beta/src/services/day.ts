import * as repo from '../db/repo';
import { entriesIn, listTrackers } from './trackers';
import {
  Activity, CaffeineIntake, DailyReflection, EnergyCheckIn, EntryKind, Meal, SleepLog, Tracker, TrackerEntry, WaterIntake,
  activityIcon, activityName, caffeineIcon, caffeineName, mealIcon, sleepHours,
} from '../lib/domain';
import { DateOnly, LocalDateTime, addDays, duration, hoursBetween, nowLocal, showTime, startOf, today } from '../lib/time';

/** Everything logged for one calendar day, plus derived totals. */
export interface DaySnapshot {
  date: DateOnly;
  isToday: boolean;
  now: LocalDateTime;
  sleep: SleepLog | null;
  meals: Meal[];
  caffeine: CaffeineIntake[];
  water: WaterIntake[];
  checkIns: EnergyCheckIn[];
  activities: Activity[];
  reflection: DailyReflection | null;
  /** Global, not per day: it might have been started yesterday. */
  running: Activity | null;

  mealsEaten: number;
  mealsSkipped: number;
  caffeineMg: number;
  waterGlasses: number;
  latestCheckIn: EnergyCheckIn | null;
  /** From Health Connect; null when not imported for this day. */
  steps: number | null;
  /** Custom tracker entries logged on this day, with their tracker. */
  trackerEntries: { tracker: Tracker; entry: TrackerEntry }[];
}

export async function getDay(date: DateOnly): Promise<DaySnapshot> {
  const start = startOf(date);
  const end = startOf(addDays(date, 1));

  const [sleeps, meals, caffeine, water, checkIns, activities, reflections, running, steps, trackers, tEntries] = await Promise.all([
    repo.sleepsWaking(start, end),
    repo.mealsIn(start, end),
    repo.caffeineIn(start, end),
    repo.waterIn(start, end),
    repo.checkInsIn(start, end),
    repo.activitiesOverlapping(start, end),
    repo.reflectionsIn(date, date),
    repo.runningActivity(),
    repo.stepsIn(date, date),
    listTrackers(true),
    entriesIn(date, date),
  ]);
  const trackerById = new Map(trackers.map((t) => [t.id, t]));

  return {
    date,
    isToday: date === today(),
    now: nowLocal(),
    sleep: sleeps.at(-1) ?? null,
    meals, caffeine, water, checkIns, activities,
    reflection: reflections[0] ?? null,
    running,
    mealsEaten: meals.filter((m) => !m.skipped).length,
    mealsSkipped: meals.filter((m) => m.skipped).length,
    caffeineMg: caffeine.reduce((s, c) => s + c.caffeineMg, 0),
    waterGlasses: water.reduce((s, w) => s + w.glasses, 0),
    latestCheckIn: checkIns.at(-1) ?? null,
    steps: steps.get(date) ?? null,
    trackerEntries: tEntries.filter((e) => trackerById.has(e.trackerId)).map((e) => ({ tracker: trackerById.get(e.trackerId)!, entry: e })),
  };
}

/** One row in a day's entry list: what it is, when, and how to edit it. */
export interface DayEntry {
  kind: EntryKind;
  id: string;
  time: LocalDateTime;
  /** Shown in the left column ("07:30", or "06:30" wake time for sleep). */
  clock: string;
  icon: string;
  tint: Tint;
  title: string;
  detail: string;
  running?: boolean;
  entry: unknown;
  /** For custom trackers: the tracker's colour key (see theme.tracker). */
  trackerColor?: string;
}

export type Tint = 'checkin' | 'meal' | 'caffeine' | 'water' | 'activity' | 'sleep' | 'reflect';

/** Every entry of the day as a flat list, in time order. */
export function dayEntries(day: DaySnapshot): DayEntry[] {
  const rows: DayEntry[] = [];

  if (day.sleep) {
    const s = day.sleep;
    rows.push({
      kind: 'sleep', id: s.id, time: s.wakeTime, clock: showTime(s.wakeTime), icon: 'weather-night', tint: 'sleep',
      title: `Slept ${duration(sleepHours(s))}`,
      detail: `${showTime(s.bedTime)} → ${showTime(s.wakeTime)} · quality ${s.quality}/5` + (s.timesWoken ? ` · woke ${s.timesWoken}×` : '') + note(s.notes),
      entry: s,
    });
  }

  for (const m of day.meals) {
    rows.push({
      kind: 'meal', id: m.id, time: m.time, clock: showTime(m.time), icon: mealIcon(m.mealType), tint: 'meal',
      title: m.skipped ? `Skipped ${m.mealType.toLowerCase()}` : m.mealType,
      detail: m.skipped ? '' : `${m.description ?? ''}${m.size ? ` · ${m.size.toLowerCase()}` : ''}`,
      entry: m,
    });
  }

  for (const c of day.caffeine) {
    rows.push({
      kind: 'caffeine', id: c.id, time: c.time, clock: showTime(c.time), icon: caffeineIcon(c.type), tint: 'caffeine',
      title: caffeineName(c.type),
      detail: `${c.servings === 1 ? '' : `${c.servings}× · `}~${c.caffeineMg} mg`,
      entry: c,
    });
  }

  for (const w of day.water) {
    rows.push({
      kind: 'water', id: w.id, time: w.time, clock: showTime(w.time), icon: 'water-outline', tint: 'water',
      title: 'Water', detail: `${w.glasses} glass${w.glasses === 1 ? '' : 'es'}`, entry: w,
    });
  }

  for (const c of day.checkIns) {
    rows.push({
      kind: 'checkin', id: c.id, time: c.time, clock: showTime(c.time), icon: 'lightning-bolt-outline', tint: 'checkin',
      title: `Energy ${c.energy}/5`,
      detail: `Sleepiness ${c.sleepiness} · mood ${c.mood}` + note(c.note),
      entry: c,
    });
  }

  for (const a of day.activities) {
    const end = a.endTime ?? day.now;
    rows.push({
      kind: 'activity', id: a.id, time: a.startTime, clock: showTime(a.startTime), icon: activityIcon(a.category), tint: 'activity',
      title: activityName(a.category),
      detail: `${showTime(a.startTime)} → ${a.endTime ? showTime(a.endTime) : 'now'} · ${duration(hoursBetween(a.startTime, end))}` + note(a.notes)
        + (a.source === 'health_connect' ? ' · from Health Connect' : ''),
      running: a.endTime == null,
      entry: a,
    });
  }

  for (const { tracker, entry: e } of day.trackerEntries) {
    const v = Number.isInteger(e.value) ? String(e.value) : e.value.toFixed(1);
    const amount = tracker.kind === 'check' ? 'Done'
      : tracker.kind === 'scale' ? `${v}/5`
        : tracker.kind === 'count' ? `+${v}${tracker.unit ? ` ${tracker.unit}` : ''}`
          : `${v}${tracker.unit ? ` ${tracker.unit}` : ''}`;
    rows.push({
      kind: 'tracker', id: e.id, time: e.time, clock: showTime(e.time), icon: tracker.icon, tint: 'checkin',
      trackerColor: tracker.color, title: tracker.name, detail: amount + note(e.note), entry: { tracker, entry: e },
    });
  }

  return rows.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.kind.localeCompare(b.kind)));
}

const note = (n: string | null) => (n ? ` · “${n}”` : '');
