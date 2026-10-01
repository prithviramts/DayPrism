import { DateOnly, LocalDateTime, hoursBetween } from './time';

// Enums are stored in the database as their names ("DeepWork"), so members can be reordered
// safely, but renaming one needs a data migration.

export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_SIZES = ['Light', 'Normal', 'Heavy'] as const;
export type MealSize = (typeof MEAL_SIZES)[number];

export const CAFFEINE_TYPES = ['Espresso', 'DoubleEspresso', 'Coffee', 'Tea', 'EnergyDrink'] as const;
export type CaffeineType = (typeof CAFFEINE_TYPES)[number];

export const ACTIVITY_CATEGORIES = [
  'Commute', 'Work', 'DeepWork', 'Meetings', 'Study', 'Exercise',
  'Creative', 'Projects', 'Social', 'ScreenTime', 'Rest', 'Other',
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export type ThemePreference = 'System' | 'Light' | 'Dark';

export type EntryKind = 'sleep' | 'meal' | 'caffeine' | 'water' | 'checkin' | 'activity' | 'reflection' | 'tracker';

/** Columns shared by every timed entry. */
interface TimedEntry {
  /** Generated on the phone (UUID), so entries can be created offline and synced later. */
  id: string;
  /** Minutes east of UTC when logged, e.g. 240 for Dubai. */
  utcOffsetMinutes: number;
  /** Created by the demo-data generator, so it can be removed without touching real data. */
  isSeed: boolean;
}

/** One night's sleep. It belongs to the day you woke up. */
export interface SleepLog extends TimedEntry {
  bedTime: LocalDateTime;
  wakeTime: LocalDateTime;
  quality: number;
  timesWoken: number;
  notes: string | null;
  /** 'health_connect' when imported, null when typed in DayPrism. */
  source?: string | null;
}

export interface Meal extends TimedEntry {
  time: LocalDateTime;
  mealType: MealType;
  description: string | null;
  size: MealSize | null;
  /** A logged skip is different from forgetting to log. */
  skipped: boolean;
}

export interface CaffeineIntake extends TimedEntry {
  time: LocalDateTime;
  type: CaffeineType;
  servings: number;
  caffeineMg: number;
}

export interface WaterIntake extends TimedEntry {
  time: LocalDateTime;
  glasses: number;
}

export interface EnergyCheckIn extends TimedEntry {
  time: LocalDateTime;
  energy: number;
  sleepiness: number;
  mood: number;
  note: string | null;
}

export interface Activity extends TimedEntry {
  startTime: LocalDateTime;
  /** Null while running. */
  endTime: LocalDateTime | null;
  category: ActivityCategory;
  notes: string | null;
  /** 'health_connect' when imported, null when typed in DayPrism. */
  source?: string | null;
}

/** End-of-day reflection, at most one per date. */
export interface DailyReflection {
  id: string;
  date: DateOnly;
  wentWell: string | null;
  didntGoWell: string | null;
  doDifferently: string | null;
  dayRating: number;
  isSeed: boolean;
}

export interface UserSettings {
  displayName: string | null;
  theme: ThemePreference;
  sleepTargetHours: number;
  waterTargetGlasses: number;
  mealsTarget: number;
  /** A limit, not a goal: 400 mg is the commonly cited daily maximum for healthy adults. */
  caffeineLimitMg: number;
  /** Daily step goal, drawn as a ring when steps are imported from Health Connect. */
  stepsTarget: number;
  /** Opt-in cycle tracking (off for everyone until they switch it on). */
  cycleTracking: boolean;
  /** Tile ids shown on Today, in order; null = the default set. */
  homeTiles: string[] | null;
}

export const DEFAULT_SETTINGS: UserSettings = {
  displayName: null,
  theme: 'System',
  sleepTargetHours: 8,
  waterTargetGlasses: 8,
  mealsTarget: 3,
  caffeineLimitMg: 400,
  stepsTarget: 8000,
  cycleTracking: false,
  homeTiles: null,
};

export const sleepHours = (s: SleepLog) => hoursBetween(s.bedTime, s.wakeTime);

/** Typical caffeine per serving. Rough averages; editable per entry. */
export function mgPerServing(type: CaffeineType): number {
  switch (type) {
    case 'Espresso': return 63;
    case 'DoubleEspresso': return 126;
    case 'Coffee': return 95;
    case 'Tea': return 47;
    case 'EnergyDrink': return 80;
  }
}

// ---------------------------------------------------------------- display names

export function activityName(c: ActivityCategory): string {
  switch (c) {
    case 'DeepWork': return 'Deep work';
    case 'ScreenTime': return 'Screen time';
    default: return c;
  }
}

export function caffeineName(t: CaffeineType): string {
  switch (t) {
    case 'DoubleEspresso': return 'Double espresso';
    case 'EnergyDrink': return 'Energy drink';
    default: return t;
  }
}

export type ActivityFamily = 'work' | 'growth' | 'exercise' | 'commute' | 'social' | 'neutral';

/**
 * Groups the 12 categories into 6 colour families. Twelve distinct colours can't be told apart
 * reliably, so related categories share a colour and everything also shows its name.
 */
export function familyOf(c: ActivityCategory): ActivityFamily {
  switch (c) {
    case 'Work': case 'DeepWork': case 'Meetings': return 'work';
    case 'Study': case 'Creative': case 'Projects': return 'growth';
    case 'Exercise': return 'exercise';
    case 'Commute': return 'commute';
    case 'Social': return 'social';
    default: return 'neutral';
  }
}

export const FAMILIES: { key: ActivityFamily; label: string }[] = [
  { key: 'work', label: 'Work' },
  { key: 'growth', label: 'Learning & creating' },
  { key: 'exercise', label: 'Exercise' },
  { key: 'commute', label: 'Commute' },
  { key: 'social', label: 'Social' },
  { key: 'neutral', label: 'Rest & other' },
];

/** Icon names from MaterialCommunityIcons. */
export const ICONS = {
  checkin: 'lightning-bolt',
  meal: 'silverware-fork-knife',
  caffeine: 'coffee',
  water: 'water',
  activity: 'play',
  sleep: 'weather-night',
  reflection: 'pencil',
} as const;

export function activityIcon(c: ActivityCategory): string {
  switch (c) {
    case 'Commute': return 'car';
    case 'Work': return 'briefcase-outline';
    case 'DeepWork': return 'head-lightbulb-outline';
    case 'Meetings': return 'account-group-outline';
    case 'Study': return 'book-open-variant';
    case 'Exercise': return 'run';
    case 'Creative': return 'palette-outline';
    case 'Projects': return 'hammer-wrench';
    case 'Social': return 'account-heart-outline';
    case 'ScreenTime': return 'cellphone';
    case 'Rest': return 'sofa-outline';
    case 'Other': return 'dots-horizontal';
  }
}

export function caffeineIcon(t: CaffeineType): string {
  switch (t) {
    case 'Tea': return 'tea-outline';
    case 'EnergyDrink': return 'bottle-soda-outline';
    default: return 'coffee-outline';
  }
}

export function mealIcon(t: MealType): string {
  switch (t) {
    case 'Breakfast': return 'bowl-mix-outline';
    case 'Snack': return 'food-apple-outline';
    default: return 'silverware-fork-knife';
  }
}

// ---------------------------------------------------------------- custom trackers

/**
 * check   yes/no per day (took meds, meditated)            day value: 1 if any entry
 * count   tap +1 (drinks, cigarettes, pages)                day value: sum
 * scale   1–5 (stress, pain)                                day value: average
 * measure a number with a unit (weight, blood sugar)        day value: latest
 */
export type TrackerKind = 'check' | 'count' | 'scale' | 'measure';

export interface Tracker {
  id: string;
  name: string;
  kind: TrackerKind;
  unit: string | null;
  icon: string;
  /** One of TRACKER_COLORS. */
  color: string;
  goal: number | null;
  goalDirection: 'at_least' | 'at_most' | null;
  sortOrder: number;
  archived: boolean;
  isSeed: boolean;
}

export interface TrackerEntry {
  id: string;
  trackerId: string;
  time: string;
  value: number;
  note: string | null;
  utcOffsetMinutes: number;
  isSeed: boolean;
}

/** Colour keys, mapped to light/dark values by the theme. */
export const TRACKER_COLORS = ['blue', 'violet', 'pink', 'red', 'orange', 'amber', 'green', 'teal'] as const;

export const TRACKER_ICONS = [
  'glass-wine', 'beer-outline', 'pill', 'meditation', 'emoticon-sad-outline', 'head-flash-outline', 'scale-bathroom',
  'smoking', 'book-open-page-variant-outline', 'water-outline', 'heart-pulse', 'run', 'weight-lifter', 'yoga',
  'sprout-outline', 'emoticon-happy-outline', 'flower-outline', 'calendar-heart', 'needle', 'tooth-outline',
  'cellphone-off', 'leaf', 'brain', 'hand-heart-outline',
] as const;

export interface TrackerTemplate {
  name: string; kind: TrackerKind; unit: string | null; icon: string; color: string;
  goal: number | null; goalDirection: 'at_least' | 'at_most' | null; hint: string;
}

export const TRACKER_TEMPLATES: TrackerTemplate[] = [
  { name: 'Alcohol', kind: 'count', unit: 'drinks', icon: 'glass-wine', color: 'pink', goal: 2, goalDirection: 'at_most', hint: 'See how drinks affect your sleep' },
  { name: 'Medication', kind: 'check', unit: null, icon: 'pill', color: 'blue', goal: null, goalDirection: null, hint: 'Did you take it today?' },
  { name: 'Meditation', kind: 'check', unit: null, icon: 'meditation', color: 'violet', goal: null, goalDirection: null, hint: 'Build a calm habit' },
  { name: 'Stress', kind: 'scale', unit: null, icon: 'head-flash-outline', color: 'orange', goal: null, goalDirection: null, hint: '1 calm to 5 very stressed' },
  { name: 'Headache', kind: 'scale', unit: null, icon: 'emoticon-sad-outline', color: 'red', goal: null, goalDirection: null, hint: 'Spot triggers over time' },
  { name: 'Weight', kind: 'measure', unit: 'kg', icon: 'scale-bathroom', color: 'teal', goal: null, goalDirection: null, hint: 'Your latest weigh-in each day' },
  { name: 'Smoking', kind: 'count', unit: 'cigarettes', icon: 'smoking', color: 'amber', goal: 0, goalDirection: 'at_most', hint: 'Count to cut down' },
  { name: 'Reading', kind: 'count', unit: 'pages', icon: 'book-open-page-variant-outline', color: 'green', goal: 20, goalDirection: 'at_least', hint: 'Small daily progress' },
];

// ---------------------------------------------------------------- cycle tracking

export const FLOWS = ['spotting', 'light', 'medium', 'heavy'] as const;
export type Flow = (typeof FLOWS)[number];

export const CYCLE_SYMPTOMS = [
  'cramps', 'headache', 'bloating', 'tender breasts', 'acne', 'mood swings', 'fatigue', 'cravings', 'back pain', 'nausea',
] as const;

export interface CycleDay {
  id: string;
  date: string;
  flow: Flow | null;
  symptoms: string[];
  note: string | null;
}
