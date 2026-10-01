import { getDb } from '../db/database';
import { mapCaffeine, mapMeal } from '../db/repo';
import { CaffeineIntake, CaffeineType, Meal, MealSize, MealType, mgPerServing } from '../lib/domain';
import { DateOnly, addDays, startOf } from '../lib/time';

// Faster logging: what you usually eat and drink, so repeating it is one tap.
// Everything is learned from your own last 60 days; nothing is shared or predicted elsewhere.

const LOOKBACK_DAYS = 60;
type Row = Record<string, any>;

export interface RecentMeal { mealType: MealType; description: string; size: MealSize | null; times: number }
export interface UsualCaffeine { type: CaffeineType; servings: number; caffeineMg: number; times: number; custom: boolean }

/** Meals you've eaten recently, most frequent first (ties: most recent first). */
export async function recentMeals(today: DateOnly, limit = 8): Promise<RecentMeal[]> {
  const rows = await getDb().getAllAsync<Row>(
    `SELECT meal_type, description, size, COUNT(*) AS times, MAX(time) AS last
     FROM meals
     WHERE deleted = 0 AND skipped = 0 AND description IS NOT NULL AND time >= ?
     GROUP BY meal_type, LOWER(TRIM(description))
     ORDER BY times DESC, last DESC
     LIMIT ?`,
    startOf(addDays(today, -LOOKBACK_DAYS)), limit);
  return rows.map((r) => ({ mealType: r.meal_type, description: r.description, size: r.size, times: r.times }));
}

/** Your usual drinks: type + servings (+ a custom mg, if you set one), most frequent first. */
export async function usualCaffeine(today: DateOnly, limit = 4): Promise<UsualCaffeine[]> {
  const rows = await getDb().getAllAsync<Row>(
    `SELECT type, servings, caffeine_mg, COUNT(*) AS times, MAX(time) AS last
     FROM caffeine_intakes
     WHERE deleted = 0 AND time >= ?
     GROUP BY type, servings, caffeine_mg
     ORDER BY times DESC, last DESC
     LIMIT ?`,
    startOf(addDays(today, -LOOKBACK_DAYS)), limit);
  return rows.map((r) => ({
    type: r.type, servings: r.servings, caffeineMg: r.caffeine_mg, times: r.times,
    custom: r.caffeine_mg !== Math.round(mgPerServing(r.type) * r.servings),
  }));
}

/** The most recent meal of a type before a date ("same as yesterday's breakfast"). */
export async function lastMealOfType(type: MealType, before: DateOnly): Promise<Meal | null> {
  const r = await getDb().getFirstAsync<Row>(
    'SELECT * FROM meals WHERE deleted = 0 AND skipped = 0 AND meal_type = ? AND time < ? AND time >= ? ORDER BY time DESC LIMIT 1',
    type, startOf(before), startOf(addDays(before, -7)));
  return r ? mapMeal(r) : null;
}

/** The last caffeine you logged (for long-press "repeat"). */
export async function lastCaffeine(): Promise<CaffeineIntake | null> {
  const r = await getDb().getFirstAsync<Row>('SELECT * FROM caffeine_intakes WHERE deleted = 0 ORDER BY time DESC LIMIT 1');
  return r ? mapCaffeine(r) : null;
}

/** Breakfast before 11, lunch before 15, snack before 18, then dinner. */
export function mealTypeFor(clock: string): MealType {
  const h = Number(clock.slice(0, 2));
  return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 18 ? 'Snack' : 'Dinner';
}

/** The id of the newest row in a table, for "Undo" right after a quick log. */
export async function newestId(table: 'meals' | 'caffeine_intakes' | 'water_intakes'): Promise<string | null> {
  const r = await getDb().getFirstAsync<{ id: string }>(`SELECT id FROM ${table} WHERE deleted = 0 ORDER BY client_updated_at DESC LIMIT 1`);
  return r?.id ?? null;
}
