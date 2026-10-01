import { getDb } from '../db/database';
import { stamp } from '../db/schema';
import { Tracker, TrackerEntry, TrackerKind, TrackerTemplate } from '../lib/domain';
import { DateOnly, LocalDateTime, addDays, dateOf, offsetAt, startOf } from '../lib/time';
import { localChanged } from '../sync/signal';
import { ValidationError, newId } from './entries';
import { avg } from './insights';

// Custom trackers: definitions (what to track) and entries (each logged value).

type Row = Record<string, any>;

const mapTracker = (r: Row): Tracker => ({
  id: r.id, name: r.name, kind: r.kind, unit: r.unit, icon: r.icon, color: r.color, goal: r.goal,
  goalDirection: r.goal_direction, sortOrder: r.sort_order, archived: r.archived === 1, isSeed: r.is_seed === 1,
});

export const mapTrackerEntry = (r: Row): TrackerEntry => ({
  id: r.id, trackerId: r.tracker_id, time: r.time, value: r.value, note: r.note,
  utcOffsetMinutes: r.utc_offset_minutes, isSeed: r.is_seed === 1,
});

// ---------------------------------------------------------------- definitions

export async function listTrackers(includeArchived = false): Promise<Tracker[]> {
  const rows = await getDb().getAllAsync<Row>(
    `SELECT * FROM trackers WHERE deleted = 0 ${includeArchived ? '' : 'AND archived = 0'} ORDER BY archived, sort_order, name`);
  return rows.map(mapTracker);
}

export interface TrackerInput {
  name: string; kind: TrackerKind; unit: string | null; icon: string; color: string;
  goal: number | null; goalDirection: 'at_least' | 'at_most' | null;
}

function check(t: TrackerInput) {
  const errors: Record<string, string> = {};
  if (!t.name.trim()) errors.name = 'Give it a name.';
  else if (t.name.trim().length > 40) errors.name = 'Keep the name under 40 characters.';
  if (t.unit && t.unit.length > 16) errors.unit = 'Keep the unit short (16 characters).';
  if (t.goal != null && (Number.isNaN(t.goal) || t.goal < 0)) errors.goal = 'The goal must be a positive number.';
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

/** Only count and measure trackers have units and goals; scale and check don't. */
function normalise(t: TrackerInput): TrackerInput {
  const hasAmount = t.kind === 'count' || t.kind === 'measure';
  return {
    ...t,
    name: t.name.trim(),
    unit: hasAmount && t.unit?.trim() ? t.unit.trim() : null,
    goal: hasAmount && t.goal != null ? t.goal : null,
    goalDirection: hasAmount && t.goal != null ? t.goalDirection ?? 'at_least' : null,
  };
}

export async function saveTracker(id: string | null, input: TrackerInput): Promise<string> {
  check(input);
  const t = normalise(input);
  const db = getDb();
  if (id == null) {
    const order = (await db.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM trackers'))?.n ?? 1;
    id = newId();
    await db.runAsync(
      `INSERT INTO trackers (id, name, kind, unit, icon, color, goal, goal_direction, sort_order, dirty, client_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      id, t.name, t.kind, t.unit, t.icon, t.color, t.goal, t.goalDirection, order, stamp());
  } else {
    // The kind can't change once there are entries: a "count" of 3 means nothing as a 1–5 scale.
    await db.runAsync(
      `UPDATE trackers SET name = ?, unit = ?, icon = ?, color = ?, goal = ?, goal_direction = ?, is_seed = 0,
         dirty = 1, client_updated_at = ? WHERE id = ?`,
      t.name, t.unit, t.icon, t.color, t.goal, t.goalDirection, stamp(), id);
  }
  localChanged();
  return id;
}

export const addFromTemplate = (tpl: TrackerTemplate) => saveTracker(null, tpl);

export async function setArchived(id: string, archived: boolean): Promise<void> {
  await getDb().runAsync('UPDATE trackers SET archived = ?, dirty = 1, client_updated_at = ? WHERE id = ?', archived ? 1 : 0, stamp(), id);
  localChanged();
}

/** Deletes a tracker and all of its entries (soft, so it syncs). */
export async function deleteTracker(id: string): Promise<void> {
  const now = stamp();
  await getDb().runAsync('UPDATE tracker_entries SET deleted = 1, dirty = 1, client_updated_at = ? WHERE tracker_id = ?', now, id);
  await getDb().runAsync('UPDATE trackers SET deleted = 1, dirty = 1, client_updated_at = ? WHERE id = ?', now, id);
  localChanged();
}

/** Moves a tracker up or down in the list. */
export async function moveTracker(id: string, direction: -1 | 1): Promise<void> {
  const list = await listTrackers(false);
  const i = list.findIndex((t) => t.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const now = stamp();
  for (let k = 0; k < list.length; k++) {
    if (list[k].sortOrder !== k) {
      await getDb().runAsync('UPDATE trackers SET sort_order = ?, dirty = 1, client_updated_at = ? WHERE id = ?', k, now, list[k].id);
    }
  }
  localChanged();
}

// ---------------------------------------------------------------- entries

export async function logTracker(tracker: Tracker, value: number, time: LocalDateTime, note?: string | null): Promise<void> {
  if (tracker.kind === 'scale' && !(value >= 1 && value <= 5)) throw new ValidationError({ value: 'Pick a value from 1 to 5.' });
  if (tracker.kind === 'measure' && (Number.isNaN(value) || value < 0 || value > 100000)) throw new ValidationError({ value: 'Enter a valid number.' });
  await getDb().runAsync(
    `INSERT INTO tracker_entries (id, tracker_id, time, value, note, utc_offset_minutes, dirty, client_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    newId(), tracker.id, time, value, note?.trim() || null, offsetAt(time), stamp());
  localChanged();
}

export async function updateTrackerEntry(id: string, value: number, time: LocalDateTime, note: string | null): Promise<void> {
  await getDb().runAsync(
    'UPDATE tracker_entries SET value = ?, time = ?, note = ?, utc_offset_minutes = ?, is_seed = 0, dirty = 1, client_updated_at = ? WHERE id = ?',
    value, time, note?.trim() || null, offsetAt(time), stamp(), id);
  localChanged();
}

export async function deleteTrackerEntry(id: string): Promise<void> {
  await getDb().runAsync('UPDATE tracker_entries SET deleted = 1, dirty = 1, client_updated_at = ? WHERE id = ?', stamp(), id);
  localChanged();
}

/** For a yes/no tracker: un-ticks today by deleting its entries for that day. */
export async function clearDay(trackerId: string, date: DateOnly): Promise<void> {
  await getDb().runAsync(
    'UPDATE tracker_entries SET deleted = 1, dirty = 1, client_updated_at = ? WHERE tracker_id = ? AND deleted = 0 AND time >= ? AND time < ?',
    stamp(), trackerId, startOf(date), startOf(addDays(date, 1)));
  localChanged();
}

export async function entriesIn(from: DateOnly, to: DateOnly): Promise<TrackerEntry[]> {
  const rows = await getDb().getAllAsync<Row>(
    'SELECT * FROM tracker_entries WHERE deleted = 0 AND time >= ? AND time < ? ORDER BY time',
    startOf(from), startOf(addDays(to, 1)));
  return rows.map(mapTrackerEntry);
}

// ---------------------------------------------------------------- day values

/** One number per tracker per day, according to its kind. Null = nothing logged that day. */
export function dayValue(kind: TrackerKind, entries: TrackerEntry[]): number | null {
  if (entries.length === 0) return null;
  switch (kind) {
    case 'check': return 1;
    case 'count': return entries.reduce((s, e) => s + e.value, 0);
    case 'scale': return avg(entries.map((e) => e.value));
    case 'measure': return entries.reduce((a, b) => (b.time > a.time ? b : a)).value;
  }
}

export function formatValue(t: Tracker, v: number | null): string {
  if (v == null) return t.kind === 'check' ? 'Not yet' : '–';
  switch (t.kind) {
    case 'check': return 'Done';
    case 'scale': return `${Number.isInteger(v) ? v : v.toFixed(1)}/5`;
    default: return `${Number.isInteger(v) ? v : v.toFixed(1)}${t.unit ? ` ${t.unit}` : ''}`;
  }
}

/** True / false against the goal, or null when there is no goal (or nothing to judge yet). */
export function metGoal(t: Tracker, v: number | null): boolean | null {
  if (t.goal == null || !t.goalDirection) return null;
  const value = v ?? 0;
  return t.goalDirection === 'at_least' ? value >= t.goal : value <= t.goal;
}

export interface TrackerToday { tracker: Tracker; value: number | null; entries: TrackerEntry[] }

export async function trackersForDay(date: DateOnly): Promise<TrackerToday[]> {
  const [trackers, entries] = await Promise.all([listTrackers(false), entriesIn(date, date)]);
  return trackers.map((t) => {
    const mine = entries.filter((e) => e.trackerId === t.id);
    return { tracker: t, value: dayValue(t.kind, mine), entries: mine };
  });
}

/** Per tracker: date → day value, over a range. */
export function dailySeries(trackers: Tracker[], entries: TrackerEntry[]): Map<string, Map<DateOnly, number>> {
  const out = new Map<string, Map<DateOnly, number>>();
  for (const t of trackers) {
    const byDay = new Map<DateOnly, TrackerEntry[]>();
    for (const e of entries) {
      if (e.trackerId !== t.id) continue;
      const d = dateOf(e.time);
      byDay.set(d, [...(byDay.get(d) ?? []), e]);
    }
    const series = new Map<DateOnly, number>();
    for (const [d, list] of byDay) series.set(d, dayValue(t.kind, list)!);
    out.set(t.id, series);
  }
  return out;
}
