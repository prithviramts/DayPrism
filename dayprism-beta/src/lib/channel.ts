import Constants from 'expo-constants';

// DayPrism Beta. Features under test are listed here. A finished feature is moved to
// ../dayprism-v1 (or the next version folder) when it's ready to ship, and its entry removed.

/** Deep-link scheme of this app ("dayprism-beta"), so widget and reminder links open the Beta, not the store app. */
export const SCHEME: string = (Constants.expoConfig?.scheme as string | undefined) ?? 'dayprism-beta';

const FEATURES = {
  /** Food database, calories, macros, vitamins and minerals. */
  nutrition: true,
} as const;

export type Feature = keyof typeof FEATURES;

export const isEnabled = (f: Feature): boolean => FEATURES[f];
