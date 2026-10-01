import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from '../db/database';
import { mapActivity } from '../db/repo';
import { stamp } from '../db/schema';
import { transaction } from '../db/transaction';
import { localChanged } from '../sync/signal';
import {
  ActivityCategory, CaffeineType, EntryKind, MealSize, MealType, activityName, mgPerServing,
} from '../lib/domain';
import { DateOnly, LocalDateTime, addDays, addMinutes, combine, hoursBetween, offsetAt, showTime } from '../lib/time';

// Creates, updates and deletes entries. Every write goes through here, so validation and rules
// (one running activity at a time, one sleep per morning, ...) live in one place.

/** Field → messages, shown under the matching form field. */
export class ValidationError extends Error {
  constructor(public readonly errors: Record<string, string>) {
    super(Object.values(errors)[0] ?? 'The entry is not valid.');
  }
}

class Check {
  errors: Record<string, string> = {};
  require(ok: boolean, field: string, message: string) {
    if (!ok && !this.errors[field]) this.errors[field] = message;
    return this;
  }
  rating(v: number, field: string, label: string) {
    return this.require(Number.isInteger(v) && v >= 1 && v <= 5, field, `Choose a ${label.toLowerCase()} rating from 1 to 5.`);
  }
  maxLength(v: string | null | undefined, max: number, field: string) {
    return this.require(!v || v.length <= max, field, `Keep this under ${max} characters.`);
  }
  throwIfAny() {
    if (Object.keys(this.errors).length > 0) throw new ValidationError(this.errors);
  }
}

const fail = (field: string, message: string): never => {
  throw new ValidationError({ [field]: message });
};

/** Trims text and stores empty strings as null, so "no note" is always null. */
const clean = (t: string | null | undefined) => (t && t.trim() ? t.trim() : null);

// ---------------------------------------------------------------- requests

export interface CheckInRequest { time: LocalDateTime; energy: number; sleepiness: number; mood: number; note?: string | null }
export interface MealRequest { time: LocalDateTime; mealType: MealType; description?: string | null; size?: MealSize | null; skipped: boolean }
export interface CaffeineRequest { time: LocalDateTime; type: CaffeineType; servings: number; caffeineMg?: number | null }
export interface WaterRequest { time: LocalDateTime; glasses: number }
export interface ActivityRequest { startTime: LocalDateTime; endTime: LocalDateTime | null; category: ActivityCategory; notes?: string | null }
/** Two clock times plus the date you woke up. A bedtime later than the wake time was the evening before. */
export interface SleepRequest { wakeDate: DateOnly; bedTime: string; wakeTime: string; quality: number; timesWoken: number; notes?: string | null }
export interface ReflectionRequest { date: DateOnly; wentWell?: string | null; didntGoWell?: string | null; doDifferently?: string | null; dayRating: number }

export function sleepTimes(r: Pick<SleepRequest, 'wakeDate' | 'bedTime' | 'wakeTime'>) {
  const wake = combine(r.wakeDate, r.wakeTime);
  const bed = combine(r.bedTime > r.wakeTime ? addDays(r.wakeDate, -1) : r.wakeDate, r.bedTime);
  return { bed, wake, hours: hoursBetween(bed, wake) };
}

// ---------------------------------------------------------------- ids

/** A new id for an entry. One-per-day rows (sleep, reflection) use the date instead, see below. */
export const newId = () => Crypto.randomUUID();
/** One sleep per wake-up date: the same id on every device, so they merge instead of duplicating. */
export const sleepId = (wakeDate: DateOnly) => `s:${wakeDate}`;
/** One reflection per date. */
export const reflectionId = (date: DateOnly) => `r:${date}`;

// ---------------------------------------------------------------- check-ins

export async function saveCheckIn(id: string | null, r: CheckInRequest): Promise<void> {
  new Check()
    .rating(r.energy, 'energy', 'Energy')
    .rating(r.sleepiness, 'sleepiness', 'Sleepiness')
    .rating(r.mood, 'mood', 'Mood')
    .maxLength(r.note, 1000, 'note')
    .throwIfAny();
  await save('energy_checkins', id, {
    time: r.time, energy: r.energy, sleepiness: r.sleepiness, mood: r.mood, note: clean(r.note), utc_offset_minutes: offsetAt(r.time),
  });
}

// ---------------------------------------------------------------- meals

export async function saveMeal(id: string | null, r: MealRequest): Promise<void> {
  new Check()
    .require(r.skipped || !!clean(r.description), 'description', 'Say what you ate, or mark the meal as skipped.')
    .require(r.skipped || !!r.size, 'size', 'Pick a size.')
    .maxLength(r.description, 1000, 'description')
    .throwIfAny();

  // A skipped meal has no contents, so drop anything the form still had filled in.
  await save('meals', id, {
    time: r.time, meal_type: r.mealType, description: r.skipped ? null : clean(r.description),
    size: r.skipped ? null : r.size ?? null, skipped: r.skipped ? 1 : 0, utc_offset_minutes: offsetAt(r.time),
  });
}

// ---------------------------------------------------------------- caffeine

export async function saveCaffeine(id: string | null, r: CaffeineRequest): Promise<void> {
  new Check()
    .require(r.servings > 0 && r.servings <= 10, 'servings', 'Servings must be between 0.5 and 10.')
    .require(r.caffeineMg == null || (r.caffeineMg >= 0 && r.caffeineMg <= 2000), 'caffeineMg', 'Caffeine must be between 0 and 2000 mg.')
    .throwIfAny();

  await save('caffeine_intakes', id, {
    time: r.time, type: r.type, servings: r.servings,
    caffeine_mg: r.caffeineMg ?? Math.round(mgPerServing(r.type) * r.servings), utc_offset_minutes: offsetAt(r.time),
  });
}

// ---------------------------------------------------------------- water

export async function saveWater(id: string | null, r: WaterRequest): Promise<void> {
  new Check().require(r.glasses >= 1 && r.glasses <= 10, 'glasses', 'Glasses must be between 1 and 10.').throwIfAny();
  await save('water_intakes', id, { time: r.time, glasses: r.glasses, utc_offset_minutes: offsetAt(r.time) });
}

// ---------------------------------------------------------------- activities

function checkActivity(r: ActivityRequest) {
  new Check()
    .require(r.endTime == null || r.endTime > r.startTime, 'endTime', 'End time must be after the start time.')
    .maxLength(r.notes, 1000, 'notes')
    .throwIfAny();
}

const activityValues = (r: ActivityRequest) => ({
  start_time: r.startTime, end_time: r.endTime, category: r.category, notes: clean(r.notes), utc_offset_minutes: offsetAt(r.startTime),
});

/**
 * Starts an activity (no end time) or logs a finished one. Only one activity can run: starting
 * a new one stops the current one at the new start time ("I stopped commuting when I started work").
 */
export async function startActivity(r: ActivityRequest): Promise<void> {
  checkActivity(r);
  await transaction(getDb(), async (tx) => {
    if (r.endTime == null) {
      const running = (await tx.getAllAsync<any>('SELECT * FROM activities WHERE deleted = 0 AND end_time IS NULL')).map(mapActivity);
      for (const current of running) {
        if (current.startTime >= r.startTime) {
          fail('startTime', `${activityName(current.category)} is running since ${showTime(current.startTime)}. Start after that, or stop it first.`);
        }
        await tx.runAsync('UPDATE activities SET end_time = ?, dirty = 1, client_updated_at = ? WHERE id = ?', r.startTime, stamp(), current.id);
      }
    }
    await insert(tx, 'activities', newId(), activityValues(r));
  });
  localChanged();
}

/** Editing never auto-stops anything; it just refuses to create a second running activity. */
export async function updateActivity(id: string, r: ActivityRequest): Promise<void> {
  checkActivity(r);
  if (r.endTime == null) {
    const other = await getDb().getFirstAsync('SELECT id FROM activities WHERE deleted = 0 AND id <> ? AND end_time IS NULL', id);
    if (other) fail('endTime', 'Another activity is running. Give this one an end time, or stop the other one first.');
  }
  await save('activities', id, activityValues(r));
}

export async function stopActivity(id: string, endTime: LocalDateTime): Promise<void> {
  const row = await getDb().getFirstAsync<any>('SELECT * FROM activities WHERE id = ?', id);
  if (!row) return;
  const a = mapActivity(row);
  if (a.endTime) fail('endTime', 'This activity has already been stopped.');
  // Stopping within the same minute as starting: give it a minute so the end is after the start.
  const end = endTime <= a.startTime ? addMinutes(a.startTime, 1) : endTime;
  await getDb().runAsync('UPDATE activities SET end_time = ?, dirty = 1, client_updated_at = ? WHERE id = ?', end, stamp(), id);
  localChanged();
}

// ---------------------------------------------------------------- sleep (one per wake-up date)

export async function upsertSleep(r: SleepRequest): Promise<void> {
  const { bed, wake, hours } = sleepTimes(r);
  new Check()
    .rating(r.quality, 'quality', 'Quality')
    .require(r.timesWoken >= 0 && r.timesWoken <= 30, 'timesWoken', 'Times woken must be between 0 and 30.')
    .require(r.bedTime !== r.wakeTime, 'wakeTime', "Bed time and wake time can't be the same.")
    .require(hours <= 16, 'bedTime', "That's more than 16 hours of sleep. Check the times.")
    .maxLength(r.notes, 2000, 'notes')
    .throwIfAny();

  await upsert('sleep_logs', sleepId(r.wakeDate), {
    bed_time: bed, wake_time: wake, quality: r.quality, times_woken: r.timesWoken, notes: clean(r.notes), utc_offset_minutes: offsetAt(wake),
  });
}

// ---------------------------------------------------------------- reflection (one per date)

export async function upsertReflection(r: ReflectionRequest): Promise<void> {
  new Check()
    .rating(r.dayRating, 'dayRating', 'Day rating')
    .maxLength(r.wentWell, 2000, 'wentWell')
    .maxLength(r.didntGoWell, 2000, 'didntGoWell')
    .maxLength(r.doDifferently, 2000, 'doDifferently')
    .throwIfAny();

  await upsert('daily_reflections', reflectionId(r.date), {
    date: r.date, went_well: clean(r.wentWell), didnt_go_well: clean(r.didntGoWell),
    do_differently: clean(r.doDifferently), day_rating: r.dayRating,
  });
}

// ---------------------------------------------------------------- delete

export const TABLE_OF: Record<EntryKind, string> = {
  sleep: 'sleep_logs',
  meal: 'meals',
  caffeine: 'caffeine_intakes',
  water: 'water_intakes',
  checkin: 'energy_checkins',
  activity: 'activities',
  reflection: 'daily_reflections',
  tracker: 'tracker_entries',
};

/** Soft delete: the row stays as a tombstone until the deletion has synced. */
export async function deleteEntry(kind: EntryKind, id: string): Promise<void> {
  await getDb().runAsync(`UPDATE ${TABLE_OF[kind]} SET deleted = 1, dirty = 1, client_updated_at = ? WHERE id = ?`, stamp(), id);
  localChanged();
}

// ---------------------------------------------------------------- writes

type Values = Record<string, string | number | null>;

async function insert(tx: SQLiteDatabase, table: string, id: string, values: Values) {
  const cols = Object.keys(values);
  await tx.runAsync(
    `INSERT INTO ${table} (id, ${cols.join(', ')}, dirty, client_updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}, 1, ?)`,
    id, ...Object.values(values), stamp());
}

/**
 * Inserts or replaces a row by id, and revives it if it was deleted. Editing a demo row makes it
 * yours (is_seed = 0), so "remove demo data" keeps it.
 */
async function upsert(table: string, id: string, values: Values) {
  const cols = Object.keys(values);
  await getDb().runAsync(
    `INSERT INTO ${table} (id, ${cols.join(', ')}, dirty, client_updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}, 1, ?)
     ON CONFLICT(id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')},
       is_seed = 0, deleted = 0, dirty = 1, client_updated_at = excluded.client_updated_at`,
    id, ...Object.values(values), stamp());
  localChanged();
}

/** New row when id is null, otherwise an update of that row. */
async function save(table: string, id: string | null, values: Values) {
  if (id == null) {
    await insert(getDb(), table, newId(), values);
    localChanged();
  } else {
    await upsert(table, id, values);
  }
}
