import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

import { migrate } from './schema';

// The on-phone copy of the signed-in user's data: one SQLCipher (AES-256) database per account,
// so two people who sign in on the same phone never share a file. Each database has its own
// random 32-byte key, kept in the Android Keystore through expo-secure-store; it never leaves
// the device. The server copy lives in Supabase, protected by row-level security.
//
// The raw-key form (x'…') skips SQLCipher's password-stretching step: the key is already
// random, so stretching would only slow down every launch.

let db: SQLite.SQLiteDatabase | null = null;
let openFor: string | null = null;

/** SecureStore keys may only contain [A-Za-z0-9._-]; user ids are UUIDs, which fit. */
const fileName = (userId: string) => `dayprism-${userId}.db`;
const keyName = (userId: string) => `dayprism.db.key.${userId}`;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database is not open yet.');
  return db;
}

export const isOpen = () => db != null;

async function getOrCreateKey(userId: string): Promise<{ key: string; created: boolean }> {
  const existing = await SecureStore.getItemAsync(keyName(userId));
  if (existing) return { key: existing, created: false };

  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(keyName(userId), key);
  return { key, created: true };
}

async function openWithKey(name: string, key: string): Promise<SQLite.SQLiteDatabase> {
  // Always a fresh native connection: expo-sqlite otherwise hands back a cached one, which
  // may already be keyed (or failed to key), and the key must be the first statement.
  const conn = await SQLite.openDatabaseAsync(name, { useNewConnection: true });
  try {
    await conn.execAsync(`PRAGMA key = "x'${key}'";`);
    // Fails with "file is not a database" if the key is wrong.
    await conn.getFirstAsync('SELECT count(*) AS n FROM sqlite_master;');
    return conn;
  } catch (e) {
    await conn.closeAsync().catch(() => {});
    throw e;
  }
}

/**
 * Opens (or creates) the signed-in user's encrypted database and brings its schema up to date.
 *
 * If a file exists but its key is gone, nobody can decrypt it; it's replaced with an empty one,
 * which then refills from the server on the next sync.
 */
export async function openUserDatabase(userId: string): Promise<void> {
  if (db && openFor === userId) return;
  await closeDatabase();

  const name = fileName(userId);
  const { key, created } = await getOrCreateKey(userId);
  let conn: SQLite.SQLiteDatabase;
  try {
    conn = await openWithKey(name, key);
  } catch (e) {
    if (!created) throw e;
    await SQLite.deleteDatabaseAsync(name).catch(() => {});
    conn = await openWithKey(name, key);
  }

  // Make sure we really are on SQLCipher, never silently on plain SQLite.
  const cipher = await conn.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version;');
  if (!cipher?.cipher_version) {
    await conn.closeAsync().catch(() => {});
    throw new Error('Encryption is not available on this build.');
  }

  await conn.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(conn);
  db = conn;
  openFor = userId;
}

export async function closeDatabase(): Promise<void> {
  if (db) await db.closeAsync().catch(() => {});
  db = null;
  openFor = null;
}

/**
 * Removes this user's on-phone copy and its key (used on sign-out and account deletion).
 * Their data stays on the server unless the account itself was deleted.
 */
export async function eraseUserDatabase(userId: string): Promise<void> {
  if (openFor === userId) await closeDatabase();
  await SQLite.deleteDatabaseAsync(fileName(userId)).catch(() => {});
  await SecureStore.deleteItemAsync(keyName(userId)).catch(() => {});
}
