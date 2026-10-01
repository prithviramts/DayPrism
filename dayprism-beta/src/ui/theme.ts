import { createContext, useContext } from 'react';

// Design tokens, carried over from the web app's palette: a calm off-white (or deep navy in
// dark mode), one brand blue, and a soft identity tint per kind of entry. Tints are decorative;
// everything coloured also has a text label.

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

const light = {
  dark: false,
  bg: '#f4f6fa',
  surface: '#ffffff',
  surface2: '#eef1f6',
  text: '#0f172a',
  text2: '#475569',
  muted: '#8a94a6',
  border: 'rgba(15, 23, 42, 0.08)',
  grid: '#e3e8ef',
  accent: '#2a78d6',
  accentInk: '#ffffff',
  accentSoft: 'rgba(42, 120, 214, 0.10)',
  danger: '#d03b3b',
  dangerSoft: 'rgba(208, 59, 59, 0.10)',
  success: '#1baf7a',
  heroFrom: '#2a78d6',
  heroTo: '#4a3aa7',
  tint: {
    checkin: '#2a78d6', meal: '#e2622d', caffeine: '#a86a12', water: '#0f97b8',
    activity: '#2a78d6', sleep: '#5b4bc4', reflect: '#c9416f',
  },
  fam: {
    work: '#2a78d6', growth: '#eb6834', exercise: '#1baf7a', commute: '#eda100',
    social: '#e87ba4', neutral: '#898781', sleep: '#4a3aa7',
  },
  series1: '#2a78d6',
  series2: '#eb6834',
  /** Custom tracker colours (identity only; every tracker also shows its name). */
  tracker: {
    blue: '#2a78d6', violet: '#5b4bc4', pink: '#c9416f', red: '#d03b3b',
    orange: '#e2622d', amber: '#a86a12', green: '#1b8f64', teal: '#0f97b8',
  } as Record<string, string>,
  /** Energy 1–5, light → dark. */
  lvl: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'],
  lvlInk: ['#0b0b0b', '#0b0b0b', '#ffffff', '#ffffff', '#ffffff'],
};

export type Theme = typeof light;

const dark: Theme = {
  dark: true,
  bg: '#0b1020',
  surface: '#151b2e',
  surface2: '#1e263d',
  text: '#f1f5f9',
  text2: '#b6c0d3',
  muted: '#7d889f',
  border: 'rgba(255, 255, 255, 0.08)',
  grid: '#252e46',
  accent: '#4b93ea',
  accentInk: '#ffffff',
  accentSoft: 'rgba(75, 147, 234, 0.16)',
  danger: '#e66767',
  dangerSoft: 'rgba(230, 103, 103, 0.16)',
  success: '#2cc28c',
  heroFrom: '#2161b8',
  heroTo: '#3d2f95',
  tint: {
    checkin: '#5a9ff0', meal: '#f08a5d', caffeine: '#e0a548', water: '#3cc3e6',
    activity: '#5a9ff0', sleep: '#9a8ff0', reflect: '#ee7fa6',
  },
  fam: {
    work: '#3987e5', growth: '#d95926', exercise: '#199e70', commute: '#c98500',
    social: '#d55181', neutral: '#898781', sleep: '#9085e9',
  },
  series1: '#3987e5',
  series2: '#d95926',
  tracker: {
    blue: '#5a9ff0', violet: '#9a8ff0', pink: '#ee7fa6', red: '#e66767',
    orange: '#f08a5d', amber: '#e0a548', green: '#2cc28c', teal: '#3cc3e6',
  },
  /** On dark, more energy = lighter (more prominent). */
  lvl: ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'],
  lvlInk: ['#ffffff', '#ffffff', '#ffffff', '#0b0b0b', '#0b0b0b'],
};

export const themes = { light, dark };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

/**
 * Content never gets wider than this (tablets, foldables, landscape): long lines and stretched
 * cards are hard to read. Screens centre a column of this width; phones are narrower anyway.
 */
export const MAX_CONTENT_WIDTH = 720;
export const contentColumn = { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };

export const ThemeContext = createContext<Theme>(light);
export const useTheme = () => useContext(ThemeContext);

/** Adds alpha to a #rrggbb colour. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
