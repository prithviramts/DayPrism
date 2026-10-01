import type {
  Activity, CaffeineIntake, DailyReflection, EnergyCheckIn, Meal, SleepLog, UserSettings, WaterIntake,
} from '../lib/domain';
import type { DateOnly, LocalDateTime } from '../lib/time';
import { getDb } from './database';

// Row ↔ object mapping and the range queries every screen uses. Times are local wall-clock
// strings, so "between a and b" is a plain text comparison that uses the time indexes.

type Row = Record<string, any>;

const bool = (v: unknown) => v === 1 || v === true;

export const mapSleep = (r: Row): SleepLog => ({
  id: r.id, bedTime: r.bed_time, wakeTime: r.wake_time, quality: r.quality, timesWoken: r.times_woken,
  notes: r.notes, utcOffsetMinutes: r.utc_offset_minutes, isSeed: bool(r.is_seed), source: r.source ?? null,
});

export const mapMeal = (r: Row): Meal => ({
  id: r.id, time: r.time, mealType: r.meal_type, description: r.description, size: r.size,
  skipped: bool(r.skipped), utcOffsetMinutes: r.utc_offset_minutes, isSeed: bool(r.is_seed),
});

export const mapCaffeine = (r: Row): CaffeineIntake => ({
  id: r.id, time: r.time, type: r.type, servings: r.servings, caffeineMg: r.caffeine_mg,
  utcOffsetMinutes: r.utc_offset_minutes, isSeed: bool(r.is_seed),
});

export const mapWater = (r: Row): WaterIntake => ({
  id: r.id, time: r.time, glasses: r.glasses, utcOffsetMinutes: r.utc_offset_minutes, isSeed: bool(r.is_seed),
});

export const mapCheckIn = (r: Row): EnergyCheckIn => ({
  id: r.id, time: r.time, energy: r.energy, sleepiness: r.sleepiness, mood: r.mood, note: r.note,
  utcOffsetMinutes: r.utc_offset_minutes, isSeed: bool(r.is_seed),
});

export const mapActivity = (r: Row): Activity => ({
  id: r.id, startTime: r.start_time, endTime: r.end_time, category: r.category, notes: r.notes,
  utcOffsetMinutes: r.utc_offset_minutes, isSeed: bool(r.is_seed), source: r.source ?? null,
});

export const mapReflection = (r: Row): DailyReflection => ({
  id: r.id, date: r.date, wentWell: r.went_well, didntGoWell: r.didnt_go_well, doDifferently: r.do_differently,
  dayRating: r.day_rating, isSeed: bool(r.is_seed),
});

const mapSettings = (r: Row): UserSettings => ({
  displayName: r.display_name, theme: r.theme, sleepTargetHours: r.sleep_target_hours,
  waterTargetGlasses: r.water_target_glasses, mealsTarget: r.meals_target, caffeineLimitMg: r.caffeine_limit_mg,
  stepsTarget: r.steps_target ?? 8000,
  cycleTracking: bool(r.cycle_tracking),
  homeTiles: parseTiles(r.home_tiles),
});

function parseTiles(raw: unknown): string[] | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- range queries [start, end)

export async function sleepsWaking(start: LocalDateTime, end: LocalDateTime): Promise<SleepLog[]> {
  const rows = await getDb().getAllAsync<Row>(
    'SELECT * FROM sleep_logs WHERE deleted = 0 AND wake_time >= ? AND wake_time < ? ORDER BY wake_time', start, end);
  return rows.map(mapSleep);
}

export async function mealsIn(start: LocalDateTime, end: LocalDateTime): Promise<Meal[]> {
  const rows = await getDb().getAllAsync<Row>('SELECT * FROM meals WHERE deleted = 0 AND time >= ? AND time < ? ORDER BY time', start, end);
  return rows.map(mapMeal);
}

export async function caffeineIn(start: LocalDateTime, end: LocalDateTime): Promise<CaffeineIntake[]> {
  const rows = await getDb().getAllAsync<Row>('SELECT * FROM caffeine_intakes WHERE deleted = 0 AND time >= ? AND time < ? ORDER BY time', start, end);
  return rows.map(mapCaffeine);
}

export async function waterIn(start: LocalDateTime, end: LocalDateTime): Promise<WaterIntake[]> {
  const rows = await getDb().getAllAsync<Row>('SELECT * FROM water_intakes WHERE deleted = 0 AND time >= ? AND time < ? ORDER BY time', start, end);
  return rows.map(mapWater);
}

export async function checkInsIn(start: LocalDateTime, end: LocalDateTime): Promise<EnergyCheckIn[]> {
  const rows = await getDb().getAllAsync<Row>('SELECT * FROM energy_checkins WHERE deleted = 0 AND time >= ? AND time < ? ORDER BY time', start, end);
  return rows.map(mapCheckIn);
}

/** Activities that overlap [start, end), so one running across midnight shows on both days. */
export async function activitiesOverlapping(start: LocalDateTime, end: LocalDateTime): Promise<Activity[]> {
  const rows = await getDb().getAllAsync<Row>(
    'SELECT * FROM activities WHERE deleted = 0 AND start_time < ? AND (end_time IS NULL OR end_time > ?) ORDER BY start_time', end, start);
  return rows.map(mapActivity);
}

export async function activitiesStarting(start: LocalDateTime, end: LocalDateTime): Promise<Activity[]> {
  const rows = await getDb().getAllAsync<Row>(
    'SELECT * FROM activities WHERE deleted = 0 AND start_time >= ? AND start_time < ? ORDER BY start_time', start, end);
  return rows.map(mapActivity);
}

export async function reflectionsIn(from: DateOnly, to: DateOnly): Promise<DailyReflection[]> {
  const rows = await getDb().getAllAsync<Row>(
    'SELECT * FROM daily_reflections WHERE deleted = 0 AND date >= ? AND date <= ? ORDER BY date', from, to);
  return rows.map(mapReflection);
}

export async function runningActivity(): Promise<Activity | null> {
  const row = await getDb().getFirstAsync<Row>(
    'SELECT * FROM activities WHERE deleted = 0 AND end_time IS NULL ORDER BY start_time DESC LIMIT 1');
  return row ? mapActivity(row) : null;
}

// ---------------------------------------------------------------- settings

export async function loadSettings(): Promise<UserSettings> {
  const row = await getDb().getFirstAsync<Row>('SELECT * FROM user_settings WHERE id = 1');
  return mapSettings(row!);
}

/** Saves settings on this phone and marks them for sync. */
export async function saveSettings(s: UserSettings): Promise<void> {
  await getDb().runAsync(
    `UPDATE user_settings SET display_name = ?, theme = ?, sleep_target_hours = ?, water_target_glasses = ?,
       meals_target = ?, caffeine_limit_mg = ?, steps_target = ?, cycle_tracking = ?, home_tiles = ?, dirty = 1 WHERE id = 1`,
    s.displayName, s.theme, s.sleepTargetHours, s.waterTargetGlasses, s.mealsTarget, s.caffeineLimitMg, s.stepsTarget,
    s.cycleTracking ? 1 : 0, s.homeTiles ? JSON.stringify(s.homeTiles) : null);
}

// ---------------------------------------------------------------- daily metrics

/** Steps per date (from Health Connect) for an inclusive date range. */
export async function stepsIn(from: DateOnly, to: DateOnly): Promise<Map<DateOnly, number>> {
  const rows = await getDb().getAllAsync<{ date: string; value: number }>(
    "SELECT date, value FROM daily_metrics WHERE deleted = 0 AND kind = 'steps' AND date >= ? AND date <= ?", from, to);
  return new Map(rows.map((r) => [r.date, r.value]));
}
