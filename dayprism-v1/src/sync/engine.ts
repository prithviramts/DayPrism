import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { supabase } from '../auth/supabase';
import { getDb, isOpen } from '../db/database';
import { ENTRY_TABLES, EntryTable } from '../db/schema';
import { onLocalChange } from './signal';

// Offline-first sync between the encrypted on-phone database and Supabase.
//
//   push  every row marked dirty is upserted to the server (by user_id + id), then marked clean,
//         unless it changed again while the request was in flight.
//   pull  rows whose server_updated_at is at or after this table's cursor are copied down,
//         except rows that have unpushed local changes (those win and go up on the next push).
//
// Conflicts resolve as "last write to reach the server wins", which suits a single person's
// diary edited from one or two devices. Deletes are soft, so they sync like any other change.

/** Columns that exist on the server, per table (besides id, user_id and the sync columns). */
const COLUMNS: Record<EntryTable, string[]> = {
  sleep_logs: ['bed_time', 'wake_time', 'quality', 'times_woken', 'notes', 'utc_offset_minutes', 'source'],
  meals: ['time', 'meal_type', 'description', 'size', 'skipped', 'utc_offset_minutes'],
  caffeine_intakes: ['time', 'type', 'servings', 'caffeine_mg', 'utc_offset_minutes'],
  water_intakes: ['time', 'glasses', 'utc_offset_minutes'],
  energy_checkins: ['time', 'energy', 'sleepiness', 'mood', 'note', 'utc_offset_minutes'],
  activities: ['start_time', 'end_time', 'category', 'notes', 'utc_offset_minutes', 'source'],
  daily_reflections: ['date', 'went_well', 'didnt_go_well', 'do_differently', 'day_rating'],
  daily_metrics: ['date', 'kind', 'value', 'source'],
  trackers: ['name', 'kind', 'unit', 'icon', 'color', 'goal', 'goal_direction', 'sort_order', 'archived'],
  tracker_entries: ['tracker_id', 'time', 'value', 'note', 'utc_offset_minutes'],
  cycle_days: ['date', 'flow', 'symptoms', 'note'],
};
const BOOLEANS = new Set(['skipped', 'is_seed', 'deleted', 'archived']);
const SETTINGS_COLUMNS = ['display_name', 'theme', 'sleep_target_hours', 'water_target_glasses', 'meals_target', 'caffeine_limit_mg', 'steps_target', 'cycle_tracking', 'home_tiles'];

const PAGE = 500;

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncStatus { state: SyncState; lastSyncedAt: number | null; error: string | null; pending: number }

let status: SyncStatus = { state: 'idle', lastSyncedAt: null, error: null, pending: 0 };
const statusListeners = new Set<() => void>();
const setStatus = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch };
  for (const l of statusListeners) l();
};
export const getSyncStatus = () => status;
export function subscribeSyncStatus(l: () => void) {
  statusListeners.add(l);
  return () => statusListeners.delete(l);
}

let userId: string | null = null;
let onRemoteChange: (() => void) | null = null;
let running: Promise<void> | null = null;
let again = false;
let cleanups: (() => void)[] = [];
let debounce: ReturnType<typeof setTimeout> | null = null;

/** Starts background sync for the signed-in user. `remoteChanged` is called when pulled data changed something. */
export function startSync(uid: string, remoteChanged: () => void): void {
  stopSync();
  userId = uid;
  onRemoteChange = remoteChanged;

  const soon = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => { syncNow().catch(() => {}); }, 1500);
  };
  const unsubLocal = onLocalChange(() => { refreshPending(); soon(); });
  const appSub = AppState.addEventListener('change', (s) => { if (s === 'active') soon(); });
  const unsubNet = NetInfo.addEventListener((s) => {
    if (s.isConnected === false) setStatus({ state: 'offline' });
    else if (status.state === 'offline') soon();
  });
  const timer = setInterval(() => { syncNow().catch(() => {}); }, 5 * 60_000);
  cleanups = [unsubLocal, () => appSub.remove(), unsubNet, () => clearInterval(timer)];

  syncNow().catch(() => {});
}

export function stopSync(): void {
  for (const c of cleanups) c();
  cleanups = [];
  if (debounce) clearTimeout(debounce);
  debounce = null;
  userId = null;
  onRemoteChange = null;
  setStatus({ state: 'idle', lastSyncedAt: null, error: null, pending: 0 });
}

/** Runs a full push + pull now. Concurrent calls coalesce into one extra run. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await runOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Rows changed on this phone that haven't reached the server yet. */
export async function pendingChanges(): Promise<number> {
  if (!isOpen()) return 0;
  const parts = ENTRY_TABLES.map((t) => `SELECT COUNT(*) AS n FROM ${t} WHERE dirty = 1`).join(' UNION ALL ');
  const rows = await getDb().getAllAsync<{ n: number }>(parts);
  const settings = await getDb().getFirstAsync<{ dirty: number }>('SELECT dirty FROM user_settings WHERE id = 1');
  return rows.reduce((s, r) => s + r.n, 0) + (settings?.dirty ?? 0);
}

async function refreshPending() {
  setStatus({ pending: await pendingChanges().catch(() => status.pending) });
}

async function runOnce(): Promise<void> {
  const uid = userId;
  if (!uid || !isOpen()) return;

  const net = await NetInfo.fetch();
  if (net.isConnected === false) {
    setStatus({ state: 'offline' });
    await refreshPending();
    return;
  }

  setStatus({ state: 'syncing', error: null });
  try {
    for (const t of ENTRY_TABLES) await pushTable(uid, t);
    await pushSettings(uid);

    let changed = false;
    for (const t of ENTRY_TABLES) changed = (await pullTable(t)) || changed;
    changed = (await pullSettings()) || changed;

    if (userId !== uid) return; // signed out meanwhile
    setStatus({ state: 'idle', lastSyncedAt: Date.now(), pending: await pendingChanges() });
    if (changed) onRemoteChange?.();
  } catch (e) {
    if (userId !== uid) return;
    setStatus({ state: 'error', error: e instanceof Error ? e.message : String(e), pending: await pendingChanges().catch(() => 0) });
  }
}

// ---------------------------------------------------------------- entries

async function pushTable(uid: string, table: EntryTable) {
  const db = getDb();
  for (;;) {
    const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM ${table} WHERE dirty = 1 LIMIT ${PAGE}`);
    if (rows.length === 0) return;

    const payload = rows.map((r) => {
      const out: Record<string, unknown> = {
        user_id: uid, id: r.id, is_seed: r.is_seed === 1, deleted: r.deleted === 1, client_updated_at: r.client_updated_at,
      };
      for (const c of COLUMNS[table]) out[c] = BOOLEANS.has(c) ? r[c] === 1 : r[c];
      return out;
    });

    const { error } = await supabase.from(table).upsert(payload, { onConflict: 'user_id,id' });
    if (error && missingTable(error)) return;
    if (error) throw new Error(error.message);

    // Clean only if it hasn't changed again since we read it.
    for (const r of rows) {
      await db.runAsync(`UPDATE ${table} SET dirty = 0 WHERE id = ? AND client_updated_at = ?`, r.id, r.client_updated_at);
    }
    if (rows.length < PAGE) return;
  }
}

const missingTable = (e: { code?: string; message?: string }) =>
  e.code === '42P01' || e.code === 'PGRST205' || /could not find the table|does not exist/i.test(e.message ?? '');

async function pullTable(table: EntryTable): Promise<boolean> {
  const db = getDb();
  const cursorKey = `pull:${table}`;
  let cursor = (await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', cursorKey))?.value ?? '1970-01-01T00:00:00Z';
  let changed = false;

  for (;;) {
    const { data, error } = await supabase.from(table).select('*')
      .gte('server_updated_at', cursor).order('server_updated_at', { ascending: true }).limit(PAGE);
    // A table added in a newer version whose server migration hasn't been run yet: skip it rather
    // than failing the whole sync. Its rows stay on the phone (dirty) and go up once it exists.
    if (error && missingTable(error)) return changed;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const r of data as Record<string, any>[]) {
      const local = await db.getFirstAsync<{ dirty: number; client_updated_at: string }>(
        `SELECT dirty, client_updated_at FROM ${table} WHERE id = ?`, r.id);
      if (local?.dirty === 1) continue; // local edit wins; it goes up on the next push
      if (local && local.client_updated_at === r.client_updated_at) continue; // already have this version

      const cols = ['id', ...COLUMNS[table], 'is_seed', 'deleted', 'client_updated_at'];
      const values = cols.map((c) => (BOOLEANS.has(c) ? (r[c] ? 1 : 0) : normalise(c, r[c])));
      await db.runAsync(
        `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}, dirty) VALUES (${cols.map(() => '?').join(', ')}, 0)`,
        ...values);
      changed = true;
    }

    const last = (data as Record<string, any>[]).at(-1)!.server_updated_at as string;
    const advanced = last !== cursor;
    cursor = last;
    await db.runAsync('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', cursorKey, cursor);
    if (data.length < PAGE || !advanced) break;
  }
  return changed;
}

/** Postgres returns timestamps like "2026-10-01T13:05:00"; keep exactly the local format we store. */
function normalise(col: string, v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === 'string' && /time$|_time$/.test(col) && v.length > 19) return v.slice(0, 19);
  return v as string | number;
}

// ---------------------------------------------------------------- settings

async function pushSettings(uid: string) {
  const db = getDb();
  const row = await db.getFirstAsync<Record<string, any>>('SELECT * FROM user_settings WHERE id = 1 AND dirty = 1');
  if (!row) return;
  const payload: Record<string, unknown> = { user_id: uid };
  for (const c of SETTINGS_COLUMNS) payload[c] = c === 'cycle_tracking' ? row[c] === 1 : row[c];
  const { error } = await supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  await db.runAsync('UPDATE user_settings SET dirty = 0 WHERE id = 1');
}

async function pullSettings(): Promise<boolean> {
  const db = getDb();
  const cursor = (await db.getFirstAsync<{ value: string }>("SELECT value FROM sync_state WHERE key = 'pull:user_settings'"))?.value;
  let q = supabase.from('user_settings').select('*').limit(1);
  if (cursor) q = q.gt('server_updated_at', cursor);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const r = data?.[0] as Record<string, any> | undefined;
  if (!r) return false;

  const local = await db.getFirstAsync<{ dirty: number }>('SELECT dirty FROM user_settings WHERE id = 1');
  if (local?.dirty !== 1) {
    await db.runAsync(
      `UPDATE user_settings SET ${SETTINGS_COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE id = 1`,
      ...SETTINGS_COLUMNS.map((c) => (c === 'cycle_tracking' ? (r[c] ? 1 : 0) : r[c])));
  }
  await db.runAsync("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('pull:user_settings', ?)", r.server_updated_at);
  return true;
}
