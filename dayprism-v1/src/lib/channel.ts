import Constants from 'expo-constants';

// DayPrism (the store version). New, unfinished features are built in ../dayprism-beta instead.

/** Deep-link scheme of this app, so widget and reminder links open it. */
export const SCHEME: string = (Constants.expoConfig?.scheme as string | undefined) ?? 'dayprism';
