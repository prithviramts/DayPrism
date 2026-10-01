import * as SecureStore from 'expo-secure-store';

import { DEFAULT_WIDGET_TILES, TileId } from '../features/tile-grid';

// What the home-screen widgets show: a small summary of today, written by the app whenever
// today's data changes. Widgets run outside the app (Android may start them without opening
// DayPrism), so they can't open the encrypted database; they read this summary instead. It lives
// in the Keystore-backed secure store, not in plain storage.

export interface WidgetTile {
  id: string;
  label: string;
  value: string;
  sub: string;
  span: 1 | 2;
  /** Quick action ("water", "checkin", "tracker&id=…"), or null to just open the app. */
  action: string | null;
  progress: number | null;
  done: boolean;
  over: boolean;
}

export interface WidgetStreak {
  current: number;
  longest: number;
  loggedToday: boolean;
  /** Last 7 days, oldest first. */
  week: { label: string; logged: boolean }[];
}

export interface WidgetSnapshot {
  version: 2;
  date: string;
  tiles: WidgetTile[];
  streak: WidgetStreak | null;
  /** App lock on: the widgets show no data. */
  locked: boolean;
}

const KEY = 'dayprism.widget';
const TILES_KEY = 'dayprism.widget.tiles';

export async function saveWidgetSnapshot(s: WidgetSnapshot): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(s));
}

export async function loadWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const s = raw ? JSON.parse(raw) : null;
    // Summaries written by older versions have a different shape: wait for the app to rewrite it.
    return s?.version === 2 ? (s as WidgetSnapshot) : null;
  } catch {
    return null;
  }
}

export async function clearWidgetSnapshot(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}

/** Which tiles the Today widget shows. Per phone (a widget belongs to this home screen). */
export async function loadWidgetTiles(): Promise<TileId[]> {
  try {
    const raw = await SecureStore.getItemAsync(TILES_KEY);
    const ids = raw ? JSON.parse(raw) : null;
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : DEFAULT_WIDGET_TILES;
  } catch {
    return DEFAULT_WIDGET_TILES;
  }
}

export async function saveWidgetTiles(ids: TileId[]): Promise<void> {
  await SecureStore.setItemAsync(TILES_KEY, JSON.stringify(ids));
}

/** Widget text is drawn with a bundled font subset: keep to plain characters. */
export const plain = (s: string) =>
  s.replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[·•]/g, '-').replace(/[–—]/g, '-').replace(/~/g, '');
