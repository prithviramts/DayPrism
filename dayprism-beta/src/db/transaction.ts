import type { SQLiteDatabase } from 'expo-sqlite';

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `task` inside BEGIN IMMEDIATE … COMMIT on the one keyed connection (rolled back if it
 * throws). Transactions are queued so two never overlap.
 *
 * Don't use expo-sqlite's withExclusiveTransactionAsync: it opens a second native connection,
 * which doesn't have the SQLCipher key and fails with "file is not a database".
 */
export function transaction<T>(conn: SQLiteDatabase, task: (tx: SQLiteDatabase) => Promise<T>): Promise<T> {
  const run = async () => {
    await conn.execAsync('BEGIN IMMEDIATE;');
    try {
      const result = await task(conn);
      await conn.execAsync('COMMIT;');
      return result;
    } catch (e) {
      await conn.execAsync('ROLLBACK;').catch(() => {});
      throw e;
    }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}
