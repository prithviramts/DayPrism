import { getDb } from '../db/database';
import { ENTRY_TABLES, stamp } from '../db/schema';
import { transaction } from '../db/transaction';
import { localChanged } from '../sync/signal';
import { reflectionId, sleepId } from './entries';
import { ActivityCategory, CaffeineType, MealSize, MealType, mgPerServing } from '../lib/domain';
import { DateOnly, addDays, at, dayNumber, hourOfDay, hoursBetween, isWorkday, offsetAt, today } from '../lib/time';

// Believable demo data with real cause and effect built in, so Insights has patterns to show:
//   - short sleep lowers next-day energy and makes late caffeine more likely
//   - caffeine after ~15:30 pushes bedtime later and lowers sleep quality
//   - skipped breakfast lowers energy before noon; a heavy lunch deepens the afternoon dip
//   - energy follows a daily curve: morning peak, post-lunch dip, evening decline
// Every row is flagged is_seed = 1, so "Remove demo data" deletes exactly these rows.
// Demo data is an admin-only tool (for screenshots and demos) and only ever goes into the
// admin's own account.

/** Small seeded PRNG (mulberry32), so the same seed gives the same data. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHECKIN_SLOTS: [number, number][] = [[8.75, 3.3], [10.75, 3.9], [13.5, 3.3], [15.25, 2.6], [18.25, 3.2], [21.5, 2.7]];
const BREAKFASTS = ['Oats with banana', 'Eggs on toast', 'Greek yogurt and granola', 'Avocado toast', 'Shakshuka'];
const LUNCHES = ['Chicken shawarma plate', 'Grilled chicken salad', 'Biryani', 'Sushi box', 'Burger and fries', 'Lentil soup and bread', 'Pasta'];
const DINNERS = ['Salmon with rice', 'Homemade curry', 'Stir-fry noodles', 'Grilled fish and veg', 'Pizza', 'Chicken wrap'];
const SNACKS = ['Dates and almonds', 'Protein bar', 'Fruit', 'Crisps', 'Chocolate'];

export type DemoRow = { table: string; id: string; values: Record<string, string | number | null> };

export function generateDemo(days: number, seed = 42, t: DateOnly = today()): DemoRow[] {
  const r = rng(seed);
  const normal = (mean: number, sd: number) => mean + sd * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const rating = (v: number) => Math.min(5, Math.max(1, Math.round(v)));
  const storyDay = (d: DateOnly, offset: number) => (dayNumber(d) + offset) % 3 === 0;
  const out: DemoRow[] = [];
  let n = 0;

  // Deterministic ids, so loading the same days again revives rows instead of duplicating them.
  const timed = (table: string, cols: string[], time: string, vals: (string | number | null)[], id?: string) => out.push({
    table,
    id: id ?? `demo:${time.slice(0, 10)}:${table}:${n++}`,
    values: { ...Object.fromEntries(cols.map((c, i) => [c, vals[i]])), utc_offset_minutes: offsetAt(time) },
  });

  function sleep(wakeDate: DateOnly, lastCaffeineHour: number) {
    const workday = isWorkday(wakeDate);
    const late = lastCaffeineHour >= 15.5;
    let bedHour = 23.25 + normal(0, 0.4);
    if (!workday) bedHour += 1;
    if (late) bedHour += 0.5 + (lastCaffeineHour - 15.5) * 0.4;
    if (storyDay(wakeDate, 0) || r() < 0.1) bedHour += 1.5;
    bedHour = Math.min(26.75, Math.max(22, bedHour));
    const wakeHour = workday ? 6.5 + normal(0, 0.15) : 8.75 + normal(0, 0.6);
    const bed = at(addDays(wakeDate, -1), bedHour);
    const wake = at(wakeDate, wakeHour);
    const hours = hoursBetween(bed, wake);
    let quality = 4 + Math.floor(r() * 3) - 1;
    if (late) quality--;
    if (hours < 6) quality--;
    if (hours >= 7.5) quality++;
    const woken = Math.floor(r() * 2) + (late ? Math.floor(r() * 3) : 0);
    const notes = late && r() < 0.5 ? 'Mind racing, took ages to fall asleep' : hours >= 8 && r() < 0.5 ? 'Slept like a log' : null;
    timed('sleep_logs', ['bed_time', 'wake_time', 'quality', 'times_woken', 'notes'], wake, [bed, wake, rating(quality), woken, notes], sleepId(wakeDate));
    return { hours, wakeHour: hourOfDay(wake) };
  }

  const first = addDays(t, -days);
  let night = sleep(first, 10);

  for (let day = first; day < t; day = addDays(day, 1)) {
    const weekend = !isWorkday(day);
    const penalty = night.hours < 6 ? 1.1 : night.hours < 7 ? 0.5 : night.hours >= 7.5 ? -0.3 : 0;
    const wakeHour = night.wakeHour;

    // ---- meals
    const skippedBreakfast = !weekend && (storyDay(day, 1) || r() < 0.2);
    const heavyLunch = r() < 0.3;
    const lunchHour = (weekend ? 13.75 : 13) + normal(0, 0.2);
    const dinnerHour = 20 + normal(0, 0.35);
    const meal = (hour: number, type: MealType, description: string | null, size: MealSize | null, skipped = false) => {
      const time = at(day, hour);
      timed('meals', ['time', 'meal_type', 'description', 'size', 'skipped'], time, [time, type, description, size, skipped ? 1 : 0]);
    };
    if (skippedBreakfast) meal(wakeHour + 0.5, 'Breakfast', null, null, true);
    else meal(wakeHour + 0.5, 'Breakfast', pick(BREAKFASTS), r() < 0.5 ? 'Light' : 'Normal');
    meal(lunchHour, 'Lunch', pick(LUNCHES), heavyLunch ? 'Heavy' : 'Normal');
    if (r() < 0.5) meal(16.25 + normal(0, 0.3), 'Snack', pick(SNACKS), 'Light');
    meal(dinnerHour, 'Dinner', pick(DINNERS), r() < 0.25 ? 'Heavy' : 'Normal');

    // ---- caffeine (tired days → more and later caffeine)
    const caffeine: [number, CaffeineType][] = [
      [wakeHour + 0.6 + normal(0, 0.1), weekend ? 'Coffee' : pick(['Espresso', 'DoubleEspresso', 'Coffee'] as const)],
    ];
    if (!weekend && r() < 0.6) caffeine.push([10.5 + normal(0, 0.25), pick(['Espresso', 'Coffee', 'Tea'] as const)]);
    if (r() < (night.hours < 6.5 ? 0.75 : 0.3)) caffeine.push([14.75 + normal(0, 0.35), pick(['Espresso', 'Coffee', 'Tea'] as const)]);
    if (night.hours < 6 || r() < 0.12) caffeine.push([16.75 + Math.abs(normal(0, 0.6)), pick(['Coffee', 'EnergyDrink'] as const)]);
    for (const [hour, type] of caffeine) {
      const time = at(day, hour);
      timed('caffeine_intakes', ['time', 'type', 'servings', 'caffeine_mg'], time, [time, type, 1, mgPerServing(type)]);
    }
    const lastCaffeineHour = Math.max(...caffeine.map((c) => c[0]));

    // ---- activities (sequential)
    let cursor = 0;
    const did = new Set<ActivityCategory>();
    const block = (category: ActivityCategory, start: number, hours: number, notes: string | null = null) => {
      start = Math.max(start, cursor);
      cursor = start + hours;
      did.add(category);
      const s = at(day, start);
      timed('activities', ['start_time', 'end_time', 'category', 'notes'], s, [s, at(day, cursor), category, notes]);
    };
    if (!weekend) {
      block('Commute', wakeHour + 0.9, 0.8 + normal(0, 0.08));
      if (r() < 0.6) block('DeepWork', cursor + 0.1, 1.75, 'Focused block, notifications off');
      else block('Work', cursor + 0.1, 1.75);
      block('Meetings', cursor, 1.25);
      block('Work', cursor, Math.max(0.25, lunchHour - cursor - 0.05));
      const afternoon = lunchHour + 0.75;
      if (r() < 0.5) block('Meetings', afternoon, 1);
      block('Work', Math.max(afternoon, cursor), Math.max(0.5, 17.25 - Math.max(afternoon, cursor)));
      block('Commute', 17.4, 0.85 + normal(0, 0.1));
      if (r() < (night.hours < 6 ? 0.25 : 0.55)) block('Exercise', 18.6, 1, 'Gym');
      if (r() < 0.7) block(pick(['Creative', 'Projects', 'Study'] as const), dinnerHour + 0.6, 1 + r() * 0.5);
      block('ScreenTime', Math.max(cursor, 21.5), 0.75 + r() * 0.75);
    } else {
      block('Rest', wakeHour + 0.25, 1.25);
      if (r() < 0.5) block('Exercise', cursor + 0.25, 1, 'Morning run');
      block(pick(['Projects', 'Creative'] as const), cursor + 0.25, Math.max(1, lunchHour - cursor - 0.5));
      if (r() < 0.6) block('Social', 15.5, 2.5, 'Out with friends');
      else block('Rest', 15.5, 2);
      block('ScreenTime', 21, 1.5);
    }

    // ---- check-ins
    const energies: number[] = [];
    for (const [slot, baseline] of CHECKIN_SLOTS) {
      if (r() < 0.15) continue; // forgot this one
      let hour = slot + normal(0, 0.2);
      if (hour < wakeHour + 0.5) hour = wakeHour + 0.75;
      let e = baseline - penalty + normal(0, 0.45);
      if (hour < 12 && skippedBreakfast) e -= 0.9;
      if (slot > 15 && slot < 16 && heavyLunch) e -= 0.6;
      if (weekend) e += 0.3;
      if (caffeine.some(([h]) => hour - h > 0 && hour - h < 1.5)) e += 0.4;
      const note = slot > 15 && slot < 16 && heavyLunch ? 'Post-lunch crash'
        : hour < 12 && skippedBreakfast && r() < 0.5 ? 'Hungry and foggy' : null;
      const energy = rating(e);
      energies.push(energy);
      const time = at(day, hour);
      timed('energy_checkins', ['time', 'energy', 'sleepiness', 'mood', 'note'], time,
        [time, energy, rating(6 - e + penalty * 0.3 + normal(0, 0.5)), rating(3.1 + (e - 3) * 0.6 + (weekend ? 0.4 : 0) + normal(0, 0.5)), note]);
    }

    // ---- water
    const glasses = 4 + Math.floor(r() * 5);
    const hours = Array.from({ length: glasses }, () => wakeHour + 0.3 + r() * (22 - wakeHour)).sort((a, b) => a - b);
    for (const h of hours) {
      const time = at(day, h);
      timed('water_intakes', ['time', 'glasses'], time, [time, 1]);
    }

    // ---- reflection
    const avgEnergy = energies.length ? energies.reduce((a, b) => a + b, 0) / energies.length : 3;
    const issues: [string, string][] = [];
    if (night.hours < 6) issues.push(['Running on too little sleep, everything felt harder.', 'Lights out by 23:00.']);
    if (skippedBreakfast) issues.push(['Skipped breakfast and was foggy before lunch.', 'Eat something before leaving home.']);
    if (lastCaffeineHour >= 15.5) issues.push(['Had caffeine too late in the afternoon.', 'No caffeine after 15:00.']);
    if (heavyLunch) issues.push(['Heavy lunch, big afternoon slump.', 'Lighter lunch and a short walk after.']);
    if (issues.length === 0) issues.push(['Too much scrolling in the evening.', 'Phone out of the bedroom.']);
    const wentWell = did.has('Exercise') ? 'Got a workout in and felt sharper after.'
      : did.has('DeepWork') ? 'Solid deep-work block in the morning.'
        : did.has('Social') ? 'Good time with friends.'
          : did.has('Projects') ? 'Moved my project forward.'
            : 'Stayed on top of work tasks.';
    out.push({
      table: 'daily_reflections',
      id: reflectionId(day),
      values: {
        date: day, went_well: wentWell, didnt_go_well: issues[0][0], do_differently: issues[0][1],
        day_rating: rating(avgEnergy + (weekend ? 0.4 : 0) - (night.hours < 6 ? 0.4 : 0) + normal(0, 0.4)),
      },
    });

    night = sleep(addDays(day, 1), lastCaffeineHour);
  }
  return out;
}

/**
 * Adds demo data for the last `days` days. Rows sync to the server like any other entry (into
 * the admin's own account). Real entries are never overwritten: a demo row only replaces a row
 * with the same id if that row is itself demo data or was deleted.
 */
export async function loadDemoData(days = 21): Promise<void> {
  const rows = generateDemo(days);
  const now = stamp();
  await transaction(getDb(), async (tx) => {
    for (const row of rows) {
      const cols = Object.keys(row.values);
      await tx.runAsync(
        `INSERT INTO ${row.table} (id, ${cols.join(', ')}, is_seed, deleted, dirty, client_updated_at)
         VALUES (?, ${cols.map(() => '?').join(', ')}, 1, 0, 1, ?)
         ON CONFLICT(id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')},
           is_seed = 1, deleted = 0, dirty = 1, client_updated_at = excluded.client_updated_at
         WHERE ${row.table}.is_seed = 1 OR ${row.table}.deleted = 1`,
        row.id, ...(Object.values(row.values) as (string | number | null)[]), now);
    }
  });
  localChanged();
}

/** Removes only demo rows (soft delete, so it syncs). Anything you edited became yours and stays. */
export async function removeDemoData(): Promise<void> {
  const now = stamp();
  await transaction(getDb(), async (tx) => {
    for (const t of ENTRY_TABLES) {
      await tx.runAsync(`UPDATE ${t} SET deleted = 1, dirty = 1, client_updated_at = ? WHERE is_seed = 1 AND deleted = 0`, now);
    }
  });
  localChanged();
}

/** Number of demo rows currently visible. */
export async function countDemoRows(): Promise<number> {
  const parts = ENTRY_TABLES.map((t) => `SELECT COUNT(*) AS n FROM ${t} WHERE is_seed = 1 AND deleted = 0`).join(' UNION ALL ');
  const rows = await getDb().getAllAsync<{ n: number }>(parts);
  return rows.reduce((a, b) => a + b.n, 0);
}
