import { getDb } from '../db/database';
import { stamp } from '../db/schema';
import { NUTRIENTS, Nutrients, scale, sum } from '../lib/nutrition/foods';
import { DateOnly, LocalDateTime, addDays, offsetAt, startOf } from '../lib/time';
import { localChanged } from '../sync/signal';
import { newId } from './entries';

// The food diary. Each row keeps the nutrients as computed when it was logged, so improving the
// food table later never silently rewrites what you ate last month.

export interface FoodLog {
  id: string;
  time: LocalDateTime;
  foodId: string | null;
  name: string;
  grams: number;
  nutrients: Nutrients;
}

type Row = { id: string; time: string; food_id: string | null; name: string; grams: number; nutrients: string };

function parseNutrients(raw: string): Nutrients {
  let obj: Record<string, unknown> = {};
  try { obj = JSON.parse(raw); } catch { /* keep zeros */ }
  return Object.fromEntries(NUTRIENTS.map((n) => [n, typeof obj[n] === 'number' ? obj[n] : 0])) as Nutrients;
}

const map = (r: Row): FoodLog => ({
  id: r.id, time: r.time, foodId: r.food_id, name: r.name, grams: r.grams, nutrients: parseNutrients(r.nutrients),
});

/** Rounds to keep the stored JSON small without losing anything meaningful. */
const compact = (n: Nutrients) =>
  JSON.stringify(Object.fromEntries(NUTRIENTS.map((k) => [k, Math.round(n[k] * 100) / 100])));

export interface NewFoodLog { foodId: string | null; name: string; grams: number; per100g: Nutrients }

export async function logFoods(items: NewFoodLog[], time: LocalDateTime): Promise<string[]> {
  const db = getDb();
  const ids: string[] = [];
  for (const item of items) {
    if (!(item.grams > 0 && item.grams <= 10000)) continue;
    const id = newId();
    await db.runAsync(
      `INSERT INTO food_logs (id, time, food_id, name, grams, nutrients, utc_offset_minutes, dirty, client_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      id, time, item.foodId, item.name.slice(0, 80), item.grams, compact(scale(item.per100g, item.grams)), offsetAt(time), stamp());
    ids.push(id);
  }
  localChanged();
  return ids;
}

export async function deleteFoodLogs(ids: string[]): Promise<void> {
  const now = stamp();
  for (const id of ids) {
    await getDb().runAsync('UPDATE food_logs SET deleted = 1, dirty = 1, client_updated_at = ? WHERE id = ?', now, id);
  }
  localChanged();
}

export async function foodsOn(date: DateOnly): Promise<FoodLog[]> {
  const rows = await getDb().getAllAsync<Row>(
    'SELECT id, time, food_id, name, grams, nutrients FROM food_logs WHERE deleted = 0 AND time >= ? AND time < ? ORDER BY time',
    startOf(date), startOf(addDays(date, 1)));
  return rows.map(map);
}

/** Totals for a day, or null when nothing was logged. */
export async function dayTotals(date: DateOnly): Promise<Nutrients | null> {
  const logs = await foodsOn(date);
  return logs.length ? sum(logs.map((l) => l.nutrients)) : null;
}

/** Foods you log most, for one-tap re-logging. */
export async function frequentFoods(limit = 8): Promise<{ foodId: string; name: string; grams: number }[]> {
  return getDb().getAllAsync<{ foodId: string; name: string; grams: number }>(
    `SELECT food_id AS foodId, name, grams FROM food_logs
     WHERE deleted = 0 AND food_id IS NOT NULL
     GROUP BY food_id ORDER BY COUNT(*) DESC, MAX(time) DESC LIMIT ?`, limit);
}
