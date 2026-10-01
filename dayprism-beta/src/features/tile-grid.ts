// Tile layout basics with no dependencies, so the home-screen widgets (which Android may run
// without opening the app) can use them without loading the database layer.

export type TileId = string; // 'sleep', 'water', …, or 'tracker:<id>'

export const HOME_SLOTS = 8;
export const WIDGET_SLOTS = 4;

export const DEFAULT_WIDGET_TILES: TileId[] = ['sleep', 'water', 'caffeine', 'checkin'];

/**
 * Lays tiles out in rows of `columns` slots, keeping your order but letting a later one-slot tile
 * fill the gap a two-slot tile would otherwise leave at the end of a row.
 */
export function packRows<T extends { span: 1 | 2 }>(tiles: T[], columns: number): T[][] {
  const queue = [...tiles];
  const rows: T[][] = [];
  while (queue.length) {
    const row: T[] = [];
    let left = columns;
    for (let i = 0; i < queue.length && left > 0;) {
      const span = Math.min(queue[i].span, columns);
      if (span <= left) {
        row.push(queue.splice(i, 1)[0]);
        left -= span;
      } else if (row.length === 0) {
        row.push(queue.splice(i, 1)[0]);
        left = 0;
      } else {
        i++;
      }
    }
    rows.push(row);
  }
  return rows;
}
