import { isEnabled } from '../lib/channel';
import { UserSettings, activityName, sleepHours } from '../lib/domain';
import { DateOnly, addDays, daysBetween, duration, fmtDate, hoursBetween, showTime } from '../lib/time';
import { CycleSummary, cycleDaysIn, summarise } from '../services/cycle';
import { DaySnapshot, getDay } from '../services/day';
import { dayTotals } from '../services/nutrition';
import { TrackerToday, formatValue, metGoal, trackersForDay } from '../services/trackers';
import { HOME_SLOTS, TileId } from './tile-grid';

export { DEFAULT_WIDGET_TILES, HOME_SLOTS, WIDGET_SLOTS, packRows } from './tile-grid';
export type { TileId } from './tile-grid';

// Tiles: the building blocks of the Today screen and the home-screen widget. You choose which
// ones you see and in what order; each takes one slot, or two for richer ones like the cycle.
// Today has 8 slots, the widget 4. This file is the model only (no React), so the widget, which
// renders outside the app, can share its values.

/** Colour reference resolved against the theme ("tint.sleep", "tracker.pink", "fam.exercise"). */
export type TileColor = `${'tint' | 'tracker' | 'fam'}.${string}`;

export interface TileDef {
  id: TileId;
  name: string;
  icon: string;
  color: TileColor;
  span: 1 | 2;
  /** One line for the picker. */
  blurb: string;
}

const BUILT_IN: TileDef[] = [
  { id: 'checkin', name: 'Energy', icon: 'lightning-bolt', color: 'tint.checkin', span: 1, blurb: 'Check in on energy and mood' },
  { id: 'sleep', name: 'Sleep', icon: 'weather-night', color: 'tint.sleep', span: 1, blurb: 'Last night, against your goal' },
  { id: 'water', name: 'Water', icon: 'water', color: 'tint.water', span: 1, blurb: 'Tap for +1 glass' },
  { id: 'meals', name: 'Meals', icon: 'silverware-fork-knife', color: 'tint.meal', span: 1, blurb: 'Long-press repeats your usual' },
  { id: 'caffeine', name: 'Caffeine', icon: 'coffee', color: 'tint.caffeine', span: 1, blurb: 'Against your daily limit' },
  { id: 'activity', name: 'Activity', icon: 'play', color: 'tint.activity', span: 1, blurb: 'Start, switch or stop a timer' },
  { id: 'reflection', name: 'Reflect', icon: 'pencil', color: 'tint.reflect', span: 1, blurb: 'Rate the day, note what went well' },
  { id: 'steps', name: 'Steps', icon: 'shoe-print', color: 'fam.exercise', span: 1, blurb: 'From Health Connect' },
  { id: 'cycle', name: 'Cycle', icon: 'water-circle', color: 'tracker.pink', span: 2, blurb: 'Cycle day and next period' },
  { id: 'nutrition', name: 'Nutrition', icon: 'food-apple', color: 'tracker.green', span: 1, blurb: 'Calories and nutrients from what you ate' },
];

/** Every tile you could add right now (cycle and nutrition only when they're switched on). */
export function catalog(settings: UserSettings, trackers: TrackerToday[]): TileDef[] {
  return [
    ...BUILT_IN.filter((d) =>
      (d.id !== 'cycle' || settings.cycleTracking) && (d.id !== 'nutrition' || isEnabled('nutrition'))),
    ...trackers.filter((x) => !x.tracker.archived).map(({ tracker }) => ({
      id: `tracker:${tracker.id}`, name: tracker.name, icon: tracker.icon,
      color: `tracker.${tracker.color}` as TileColor, span: 1 as const,
      blurb: tracker.kind === 'count' ? 'Tap to add one' : tracker.kind === 'check' ? 'Tap to tick off' : 'Tap to log',
    })),
  ];
}

export const slotsUsed = (ids: TileId[], defs: TileDef[]) =>
  ids.reduce((n, id) => n + (defs.find((d) => d.id === id)?.span ?? 0), 0);

/** Keeps known tiles, drops duplicates and whatever doesn't fit the slot budget. */
export function resolveTiles(ids: TileId[], defs: TileDef[], slots: number): TileDef[] {
  const out: TileDef[] = [];
  let used = 0;
  for (const id of new Set(ids)) {
    const d = defs.find((x) => x.id === id);
    if (!d || used + d.span > slots) continue;
    out.push(d);
    used += d.span;
  }
  return out;
}

/** What Today shows before you customise it: the essentials, then your trackers in the spare slots. */
export function defaultHomeTiles(settings: UserSettings, defs: TileDef[]): TileId[] {
  const base = settings.cycleTracking
    ? ['checkin', 'sleep', 'water', 'meals', 'caffeine', 'activity', 'cycle']
    : ['checkin', 'sleep', 'water', 'meals', 'caffeine', 'activity', 'reflection'];
  const extra = defs.filter((d) => d.id.startsWith('tracker:')).map((d) => d.id);
  return resolveTiles([...base, ...extra, 'steps'], defs, HOME_SLOTS).map((d) => d.id);
}

// ---------------------------------------------------------------- values

export interface TileData {
  day: DaySnapshot;
  trackers: TrackerToday[];
  cycle: CycleSummary | null;
  /** Calories eaten today (Beta), null when nutrition is off or nothing logged. */
  kcal: number | null;
}

export async function loadTileData(date: DateOnly, settings: UserSettings): Promise<TileData> {
  const [day, trackers, cycleDays] = await Promise.all([
    getDay(date),
    trackersForDay(date),
    settings.cycleTracking ? cycleDaysIn(addDays(date, -400), date) : Promise.resolve(null),
  ]);
  const kcal = isEnabled('nutrition') ? (await dayTotals(date))?.kcal ?? null : null;
  return { day, trackers, cycle: cycleDays ? summarise(cycleDays, date) : null, kcal };
}

export interface TileValue {
  def: TileDef;
  value: string;
  sub: string;
  /** 0–1 towards a goal, when there is one. */
  progress: number | null;
  done: boolean;
  /** Past a limit (caffeine, an "at most" tracker). */
  over: boolean;
  /** Shortcut for the widget ("water", "checkin", "tracker&id=…"), or null to just open the app. */
  action: string | null;
}

export function tileValue(def: TileDef, d: TileData, s: UserSettings): TileValue {
  const { day } = d;
  const base = { def, progress: null, done: false, over: false, action: null } as TileValue;
  switch (def.id) {
    case 'checkin': {
      const c = day.latestCheckIn;
      return { ...base, value: c ? `${c.energy}/5` : '–', sub: c ? `at ${showTime(c.time)}` : 'Check in', done: !!c, action: 'checkin' };
    }
    case 'sleep': {
      const h = day.sleep ? sleepHours(day.sleep) : null;
      return {
        ...base, value: h != null ? duration(h) : '–', sub: day.sleep ? `quality ${day.sleep.quality}/5` : `${s.sleepTargetHours}h goal`,
        progress: h != null ? h / s.sleepTargetHours : 0, done: !!day.sleep, action: 'sleep',
      };
    }
    case 'water':
      return {
        ...base, value: `${day.waterGlasses}/${s.waterTargetGlasses}`, sub: 'glasses',
        progress: day.waterGlasses / s.waterTargetGlasses, done: day.waterGlasses >= s.waterTargetGlasses, action: 'water',
      };
    case 'meals':
      return {
        ...base, value: `${day.mealsEaten}/${s.mealsTarget}`, sub: day.mealsSkipped ? `${day.mealsSkipped} skipped` : 'eaten',
        progress: day.mealsEaten / s.mealsTarget, done: day.mealsEaten >= s.mealsTarget, action: 'meal',
      };
    case 'caffeine':
      return {
        ...base, value: `${day.caffeineMg} mg`, sub: `of ${s.caffeineLimitMg} mg max`,
        progress: day.caffeineMg / s.caffeineLimitMg, over: day.caffeineMg > s.caffeineLimitMg, action: 'caffeine',
      };
    case 'activity': {
      const r = day.running;
      return r
        ? { ...base, value: activityName(r.category), sub: `${duration(hoursBetween(r.startTime, day.now))} so far`, done: true, action: 'activity' }
        : { ...base, value: 'Start', sub: 'a timer', action: 'activity' };
    }
    case 'reflection':
      return {
        ...base, value: day.reflection ? `${day.reflection.dayRating}/5` : '–', sub: day.reflection ? 'day rated' : 'End of day',
        done: !!day.reflection, action: 'reflection',
      };
    case 'steps':
      return {
        ...base, value: day.steps != null ? day.steps.toLocaleString() : '–',
        sub: day.steps != null ? `of ${s.stepsTarget.toLocaleString()}` : 'Health Connect',
        progress: day.steps != null ? day.steps / s.stepsTarget : null, done: (day.steps ?? 0) >= s.stepsTarget,
      };
    case 'cycle':
      return { ...base, ...cycleText(d.cycle, day.date), action: 'cycle' };
    case 'nutrition':
      return { ...base, value: d.kcal != null ? `${Math.round(d.kcal)}` : '–', sub: 'kcal today', action: 'nutrition' };
    default: {
      const item = d.trackers.find((x) => `tracker:${x.tracker.id}` === def.id);
      if (!item) return { ...base, value: '–', sub: '' };
      const { tracker, value } = item;
      const met = metGoal(tracker, value);
      return {
        ...base, value: formatValue(tracker, value),
        sub: tracker.goal != null && tracker.kind !== 'check' ? `goal ${tracker.goalDirection === 'at_most' ? '≤' : '≥'} ${tracker.goal}` : tracker.kind === 'check' ? (value != null ? 'done' : 'not yet') : 'today',
        progress: tracker.goal != null && tracker.goalDirection === 'at_least' ? (value ?? 0) / tracker.goal : null,
        done: tracker.kind === 'check' ? value != null : met === true,
        over: tracker.goalDirection === 'at_most' && met === false,
        action: `tracker&id=${tracker.id}`,
      };
    }
  }
}

function cycleText(c: CycleSummary | null, date: DateOnly): { value: string; sub: string } {
  if (!c || c.cycleDay == null) return { value: 'Start tracking', sub: 'Log the first day of your period' };
  const value = c.onPeriod ? `Period, day ${c.cycleDay}` : `Cycle day ${c.cycleDay}`;
  if (!c.nextStart) return { value, sub: 'Prediction after one full cycle' };
  const n = daysBetween(date, c.nextStart);
  const sub = n > 0 ? `Next period in ~${n} day${n === 1 ? '' : 's'} (${fmtDate(c.nextStart, 'd MMM')})`
    : n === 0 ? 'Period may start today' : `Period ${-n} day${n === -1 ? '' : 's'} late`;
  return { value, sub };
}
