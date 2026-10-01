import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';
import {
  ExerciseType, SdkAvailabilityStatus, aggregateGroupByPeriod, getGrantedPermissions, getSdkStatus, initialize,
  openHealthConnectSettings, readRecords, requestPermission,
} from 'react-native-health-connect';

import { getDb } from '../db/database';
import { stamp } from '../db/schema';
import { DateOnly, LocalDateTime, addDays, dateOf, hoursBetween, offsetAt, startOf, toLocal, today } from '../lib/time';
import { localChanged } from '../sync/signal';

// Health Connect is Android's shared health store: Samsung Health, Google Fit, Fitbit, Garmin,
// Oura and most watches write to it. DayPrism only READS three things, and only after the user
// grants each one in the system dialog:
//
//   steps     → one daily total per date (daily_metrics), refreshed on every import
//   workouts  → Exercise activities on the timeline (kept once imported; your edits win)
//   sleep     → offered as a suggestion on Today, never saved without you confirming it,
//               because Health Connect has no "quality" rating and we won't invent one.

const ENABLED_KEY = 'dayprism.healthconnect';
const LAST_IMPORT_KEY = 'dayprism.healthconnect.last';
const IMPORT_DAYS = 14;
const SOURCE = 'health_connect';

const PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'SleepSession' },
] as const;

export type HealthConnectStatus = 'unavailable' | 'needs-install' | 'off' | 'on';

let initialized = false;
async function ensureInit(): Promise<boolean> {
  if (initialized) return true;
  initialized = await initialize().catch(() => false);
  return initialized;
}

export async function healthConnectStatus(): Promise<HealthConnectStatus> {
  let sdk: number;
  try {
    sdk = await getSdkStatus();
  } catch {
    return 'unavailable';
  }
  if (sdk === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'needs-install';
  if (sdk !== SdkAvailabilityStatus.SDK_AVAILABLE) return 'unavailable';
  const enabled = (await SecureStore.getItemAsync(ENABLED_KEY).catch(() => null)) === '1';
  return enabled ? 'on' : 'off';
}

/** Shows the system permission dialog. Returns true if at least one data type was granted. */
export async function connectHealthConnect(): Promise<boolean> {
  if (!(await ensureInit())) return false;
  const granted = await requestPermission([...PERMISSIONS]);
  if (granted.length === 0) return false;
  await SecureStore.setItemAsync(ENABLED_KEY, '1');
  await SecureStore.deleteItemAsync(LAST_IMPORT_KEY).catch(() => {});
  return true;
}

/** Stops importing. Already-imported entries stay; permissions can be revoked in Health Connect. */
export async function disconnectHealthConnect(): Promise<void> {
  await SecureStore.deleteItemAsync(ENABLED_KEY).catch(() => {});
}

export const openHealthConnectPermissions = () => {
  try { openHealthConnectSettings(); } catch { /* not installed */ }
};

export const installHealthConnect = () =>
  Linking.openURL('market://details?id=com.google.android.apps.healthdata').catch(() =>
    Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata'));

async function granted(recordType: string): Promise<boolean> {
  const list = await getGrantedPermissions().catch(() => []);
  return list.some((p) => p.recordType === recordType && p.accessType === 'read');
}

/** Converts a Health Connect ISO instant to this phone's local wall-clock time. */
const local = (iso: string): LocalDateTime => toLocal(new Date(iso));

const EXERCISE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ExerciseType).map(([name, code]) => [code as number, name.toLowerCase().replace(/_/g, ' ')]));

/** What the last import found, for the "Import now" summary. */
export interface ImportReport { changed: number; todaySteps: number | null; stepSources: string[] }
let lastReport: ImportReport = { changed: 0, todaySteps: null, stepSources: [] };
export const lastImportReport = () => lastReport;

/**
 * Steps per local day. Health Connect's own daily total only counts apps in its "data sources
 * and priority" list, which some watch apps never get added to; and adding raw records from
 * every app would double count (phone and watch both counting the same walk). So: sum the raw
 * records per app per day, take the busiest single app, and keep whichever of that and Health
 * Connect's total is higher.
 */
async function stepsByDay(range: { operator: 'between'; startTime: string; endTime: string }) {
  const totals = new Map<DateOnly, number>();
  const sources = new Map<DateOnly, Set<string>>();

  const grouped = await aggregateGroupByPeriod({
    recordType: 'Steps', timeRangeFilter: range, timeRangeSlicer: { period: 'DAYS', length: 1 },
  }).catch(() => []);
  for (const d of grouped) {
    const date = dateOf(local(d.startTime));
    totals.set(date, Math.round(d.result.COUNT_TOTAL ?? 0));
  }

  const perApp = new Map<string, number>(); // "date|app" -> steps
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await readRecords('Steps', { timeRangeFilter: range, pageToken }).catch(() => null);
    if (!res) break;
    for (const r of res.records) {
      const date = dateOf(local(r.startTime));
      const app = r.metadata?.dataOrigin ?? 'unknown';
      perApp.set(`${date}|${app}`, (perApp.get(`${date}|${app}`) ?? 0) + r.count);
      if (!sources.has(date)) sources.set(date, new Set());
      sources.get(date)!.add(app);
    }
    pageToken = res.pageToken || undefined;
    if (!pageToken) break;
  }
  for (const [key, steps] of perApp) {
    const date = key.slice(0, 10);
    totals.set(date, Math.max(totals.get(date) ?? 0, Math.round(steps)));
  }
  return { totals, sources };
}

/**
 * Imports the last two weeks of steps and workouts. Throttled to once every 2 minutes unless
 * `force`. Returns the number of rows that changed.
 */
export async function importFromHealthConnect(force = false): Promise<number> {
  if ((await healthConnectStatus()) !== 'on') return 0;
  const last = Number(await SecureStore.getItemAsync(LAST_IMPORT_KEY).catch(() => null) ?? 0);
  if (!force && Date.now() - last < 2 * 60_000) return 0;
  if (!(await ensureInit())) return 0;

  const t = today();
  const from = addDays(t, -(IMPORT_DAYS - 1));
  const range = { operator: 'between' as const, startTime: new Date(`${startOf(from)}`).toISOString(), endTime: new Date().toISOString() };
  const db = getDb();
  let changed = 0;

  // ---- steps: one total per day (see stepsByDay for how double counting is avoided)
  let todaySteps: number | null = null;
  let stepSources: string[] = [];
  if (await granted('Steps')) {
    const { totals, sources } = await stepsByDay(range);
    todaySteps = totals.get(t) ?? 0;
    stepSources = [...(sources.get(t) ?? [])];
    for (const [date, value] of totals) {
      const res = await db.runAsync(
        `INSERT INTO daily_metrics (id, date, kind, value, source, dirty, client_updated_at) VALUES (?, ?, 'steps', ?, ?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET value = excluded.value, dirty = 1, client_updated_at = excluded.client_updated_at
         WHERE daily_metrics.value <> excluded.value`,
        `steps:${date}`, date, value, SOURCE, stamp());
      changed += res.changes;
    }
  }

  // ---- workouts: Exercise activities; never overwrite one you've edited or deleted
  if (await granted('ExerciseSession')) {
    const { records } = await readRecords('ExerciseSession', { timeRangeFilter: range }).catch(() => ({ records: [] }));
    for (const r of records) {
      const start = local(r.startTime);
      const end = local(r.endTime);
      if (hoursBetween(start, end) <= 0) continue;
      const name = r.title || EXERCISE_NAMES[r.exerciseType] || 'workout';
      const res = await db.runAsync(
        `INSERT OR IGNORE INTO activities (id, start_time, end_time, category, notes, utc_offset_minutes, source, dirty, client_updated_at)
         VALUES (?, ?, ?, 'Exercise', ?, ?, ?, 1, ?)`,
        `hc:${r.metadata?.id ?? `${r.startTime}`}`.slice(0, 64), start, end,
        name.charAt(0).toUpperCase() + name.slice(1), offsetAt(start), SOURCE, stamp());
      changed += res.changes;
    }
  }

  await SecureStore.setItemAsync(LAST_IMPORT_KEY, String(Date.now()));
  lastReport = { changed, todaySteps, stepSources };
  if (changed > 0) localChanged();
  return changed;
}

/** Last night's sleep as Health Connect recorded it (longest session ending this morning), or null. */
export async function suggestedSleep(date: DateOnly): Promise<{ bed: LocalDateTime; wake: LocalDateTime; hours: number } | null> {
  if ((await healthConnectStatus()) !== 'on' || !(await ensureInit()) || !(await granted('SleepSession'))) return null;
  const { records } = await readRecords('SleepSession', {
    timeRangeFilter: {
      operator: 'between',
      startTime: new Date(`${addDays(date, -1)}T18:00:00`).toISOString(),
      endTime: new Date(`${date}T15:00:00`).toISOString(),
    },
  }).catch(() => ({ records: [] }));

  let best: { bed: LocalDateTime; wake: LocalDateTime; hours: number } | null = null;
  for (const r of records) {
    const bed = local(r.startTime);
    const wake = local(r.endTime);
    const hours = hoursBetween(bed, wake);
    if (dateOf(wake) !== date || hours < 1 || hours > 16) continue;
    if (!best || hours > best.hours) best = { bed, wake, hours };
  }
  return best;
}
