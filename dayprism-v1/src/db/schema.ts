import type { SQLiteDatabase } from 'expo-sqlite';

import { transaction } from './transaction';

// Schema migrations for the on-phone database, tracked with PRAGMA user_version. Add new steps to
// the end; never edit a step that has shipped, because phones in the wild have already run it.
//
// Every entry row carries sync bookkeeping:
//   id                text, generated on the phone (UUID; "s:<date>" / "r:<date>" for one-per-day rows)
//   deleted           soft delete, so deletions sync to the server and other devices
//   dirty             1 = changed here and not yet pushed to the server
//   client_updated_at when it was last changed on this phone (ISO UTC)

const sync = `
  utc_offset_minutes INTEGER NOT NULL DEFAULT 0,
  is_seed INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 1,
  client_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE sleep_logs (
    id TEXT PRIMARY KEY,
    bed_time TEXT NOT NULL,
    wake_time TEXT NOT NULL,
    quality INTEGER NOT NULL,
    times_woken INTEGER NOT NULL DEFAULT 0,
    notes TEXT,${sync}
  );
  CREATE INDEX ix_sleep_wake ON sleep_logs (wake_time);

  CREATE TABLE meals (
    id TEXT PRIMARY KEY,
    time TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    description TEXT,
    size TEXT,
    skipped INTEGER NOT NULL DEFAULT 0,${sync}
  );
  CREATE INDEX ix_meals_time ON meals (time);

  CREATE TABLE caffeine_intakes (
    id TEXT PRIMARY KEY,
    time TEXT NOT NULL,
    type TEXT NOT NULL,
    servings REAL NOT NULL DEFAULT 1,
    caffeine_mg INTEGER NOT NULL,${sync}
  );
  CREATE INDEX ix_caffeine_time ON caffeine_intakes (time);

  CREATE TABLE water_intakes (
    id TEXT PRIMARY KEY,
    time TEXT NOT NULL,
    glasses INTEGER NOT NULL DEFAULT 1,${sync}
  );
  CREATE INDEX ix_water_time ON water_intakes (time);

  CREATE TABLE energy_checkins (
    id TEXT PRIMARY KEY,
    time TEXT NOT NULL,
    energy INTEGER NOT NULL,
    sleepiness INTEGER NOT NULL,
    mood INTEGER NOT NULL,
    note TEXT,${sync}
  );
  CREATE INDEX ix_checkins_time ON energy_checkins (time);

  CREATE TABLE activities (
    id TEXT PRIMARY KEY,
    start_time TEXT NOT NULL,
    end_time TEXT,
    category TEXT NOT NULL,
    notes TEXT,${sync}
  );
  CREATE INDEX ix_activities_start ON activities (start_time);
  CREATE INDEX ix_activities_end ON activities (end_time);

  CREATE TABLE daily_reflections (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    went_well TEXT,
    didnt_go_well TEXT,
    do_differently TEXT,
    day_rating INTEGER NOT NULL,${sync}
  );
  CREATE INDEX ix_reflections_date ON daily_reflections (date);

  CREATE TABLE user_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    display_name TEXT,
    theme TEXT NOT NULL DEFAULT 'System',
    sleep_target_hours REAL NOT NULL DEFAULT 8,
    water_target_glasses INTEGER NOT NULL DEFAULT 8,
    meals_target INTEGER NOT NULL DEFAULT 3,
    caffeine_limit_mg INTEGER NOT NULL DEFAULT 400,
    dirty INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO user_settings (id) VALUES (1);

  -- Pull cursors (last server_updated_at seen, per table) and other sync bookkeeping.
  CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT);
  `,

  // 2: Health Connect import (source column, daily metrics such as steps, step goal)
  `
  ALTER TABLE sleep_logs ADD COLUMN source TEXT;
  ALTER TABLE activities ADD COLUMN source TEXT;
  ALTER TABLE user_settings ADD COLUMN steps_target INTEGER NOT NULL DEFAULT 8000;

  CREATE TABLE daily_metrics (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    kind TEXT NOT NULL,
    value REAL NOT NULL,
    source TEXT,${sync}
  );
  CREATE INDEX ix_daily_metrics_date ON daily_metrics (date, kind);
  `,

  // 3: custom trackers
  `
  CREATE TABLE trackers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    unit TEXT,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    goal REAL,
    goal_direction TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,${sync}
  );

  CREATE TABLE tracker_entries (
    id TEXT PRIMARY KEY,
    tracker_id TEXT NOT NULL,
    time TEXT NOT NULL,
    value REAL NOT NULL,
    note TEXT,${sync}
  );
  CREATE INDEX ix_tracker_entries_time ON tracker_entries (time);
  CREATE INDEX ix_tracker_entries_tracker ON tracker_entries (tracker_id, time);
  `,

  // 4: cycle tracking (opt-in)
  `
  ALTER TABLE user_settings ADD COLUMN cycle_tracking INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE cycle_days (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    flow TEXT,
    symptoms TEXT,
    note TEXT,${sync}
  );
  CREATE INDEX ix_cycle_days_date ON cycle_days (date);
  `,

  // 5: customizable home tiles (JSON array of tile ids)
  `
  ALTER TABLE user_settings ADD COLUMN home_tiles TEXT;
  `,

  // 6: food diary table, used by DayPrism Beta only. Unused here; kept so both versions number
  //    their migrations the same way, and a feature moved over from Beta can't skip one.
  `
  CREATE TABLE food_logs (
    id TEXT PRIMARY KEY,
    time TEXT NOT NULL,
    food_id TEXT,
    name TEXT NOT NULL,
    grams REAL NOT NULL,
    nutrients TEXT NOT NULL,${sync}
  );
  CREATE INDEX ix_food_logs_time ON food_logs (time);
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await transaction(db, async (tx) => {
      await tx.execAsync(sql);
      await tx.execAsync(`PRAGMA user_version = ${next};`);
    });
    version = next;
  }
}

/** Every entry table (synced with the server table of the same name). */
export const ENTRY_TABLES = [
  'sleep_logs', 'meals', 'caffeine_intakes', 'water_intakes', 'energy_checkins', 'activities', 'daily_reflections',
  'daily_metrics', 'trackers', 'tracker_entries', 'cycle_days',
] as const;
export type EntryTable = (typeof ENTRY_TABLES)[number];

/** Current time as stored in client_updated_at. */
export const stamp = () => new Date().toISOString();
