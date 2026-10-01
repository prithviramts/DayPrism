import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

import { DaySnapshot } from '../services/day';
import { StreakInfo } from '../services/streaks';
import { addDays, combine, dayOfWeek, firstWeekday, fromLocal, hourOfDay, nowLocal, today } from '../lib/time';

// Gentle daily reminders, all local to this phone (no server, no push service).
//
// "Smart" skipping: instead of one repeating alarm, the next 14 days are scheduled as separate
// notifications, and today's are rebuilt whenever you log something. So if you've already logged
// last night's sleep, written today's reflection, or checked in shortly before a check-in reminder,
// that reminder simply doesn't fire. If the app isn't opened for two weeks, reminders stop, which
// is kinder than nagging someone who has stopped using it.

export interface ReminderSettings {
  enabled: boolean;
  sleep: { on: boolean; time: string };
  checkIns: { on: boolean; times: string[] };
  reflection: { on: boolean; time: string };
  /** Evening nudge when you have a streak going and haven't logged anything today. */
  streak: { on: boolean; time: string };
  /** Your week in review, on the last day of the week. */
  weekly: { on: boolean; time: string };
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false,
  sleep: { on: true, time: '08:30' },
  checkIns: { on: true, times: ['11:00', '15:00', '19:00'] },
  reflection: { on: true, time: '21:30' },
  streak: { on: true, time: '20:00' },
  weekly: { on: true, time: '19:00' },
};

const KEY = 'dayprism.reminders';
const CHANNEL = 'reminders';
const DAYS_AHEAD = 14;
/** A check-in logged within this many hours before a check-in reminder makes that reminder unnecessary. */
const CHECKIN_GRACE_HOURS = 1.5;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function loadReminderSettings(): Promise<ReminderSettings> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    // Merge with defaults so reminders added in newer versions get their default values.
    return raw ? { ...DEFAULT_REMINDERS, ...JSON.parse(raw) } : DEFAULT_REMINDERS;
  } catch {
    return DEFAULT_REMINDERS;
  }
}

export async function saveReminderSettings(s: ReminderSettings): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(s));
}

/** Asks for permission if needed. Returns false if the user (or the system) said no. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

let channelReady = false;
async function ensureChannel() {
  if (channelReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Daily reminders',
    description: 'Gentle nudges to log sleep, check in and reflect.',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#2a78d6',
  });
  channelReady = true;
}

/** Varied wording, so the same reminder doesn't read identically every day. */
function pick<T>(options: T[], date: string): T {
  const n = Number(date.slice(8, 10)) + Number(date.slice(5, 7));
  return options[n % options.length];
}

function checkInCopy(time: string, date: string) {
  const h = Number(time.slice(0, 2));
  const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  return {
    title: `${part} check-in`,
    body: pick([
      'How\'s your energy right now? It takes 10 seconds.',
      'A quick check-in now makes your patterns clearer later.',
      'How are you feeling? Tap to log energy and mood.',
    ], date),
  };
}

/**
 * Rebuilds all scheduled reminders. `day` is today's snapshot (or null when unknown), used to
 * skip today's reminders that are no longer needed.
 */
export async function rescheduleReminders(day: DaySnapshot | null, streak: StreakInfo | null = null): Promise<void> {
  const settings = await loadReminderSettings();
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!settings.enabled) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await ensureChannel();

  const now = nowLocal();
  const t = today();
  const isTodayData = day?.date === t;

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = addDays(t, i);
    const jobs: { time: string; title: string; body: string; url: string }[] = [];

    if (settings.sleep.on) {
      const skip = i === 0 && isTodayData && !!day!.sleep;
      if (!skip) {
        jobs.push({
          time: settings.sleep.time,
          title: pick(['Good morning ☀️', 'Morning!', 'Rise and shine'], date),
          body: 'How did you sleep? Log last night in a few seconds.',
          url: '/quick?action=sleep',
        });
      }
    }

    if (settings.checkIns.on) {
      for (const time of settings.checkIns.times) {
        const recent = i === 0 && isTodayData && day!.checkIns.some((c) => {
          const gap = hourOfDay(combine(date, time)) - hourOfDay(c.time);
          return gap >= 0 && gap <= CHECKIN_GRACE_HOURS;
        });
        if (!recent) jobs.push({ time, ...checkInCopy(time, date), url: '/quick?action=checkin' });
      }
    }

    if (settings.reflection.on) {
      const skip = i === 0 && isTodayData && !!day!.reflection;
      if (!skip) {
        jobs.push({
          time: settings.reflection.time,
          title: pick(['Wind down 🌙', 'How was today?', 'Close the day'], date),
          body: 'Rate your day and note one thing that went well.',
          url: '/quick?action=reflection',
        });
      }
    }

    // Streak saver: tonight if there's a streak to save and nothing is logged yet; tomorrow night
    // too once today is logged (rebuilt the moment you log, so it only fires if you really haven't).
    if (settings.streak.on && streak && streak.current >= 2) {
      const n = i === 0 && !streak.loggedToday ? streak.current : i === 1 && streak.loggedToday ? streak.current + 1 : null;
      if (n != null) {
        jobs.push({
          time: settings.streak.time,
          title: `Keep your ${n}-day streak 🔥`,
          body: 'Log anything (a check-in, a glass of water) to keep it going.',
          url: '/quick?action=checkin',
        });
      }
    }

    // Weekly summary on the last day of your week.
    if (settings.weekly.on && dayOfWeek(date) === (firstWeekday + 6) % 7) {
      jobs.push({ time: settings.weekly.time, title: 'Your week in DayPrism', body: 'See how your week went: sleep, energy, streaks and goals.', url: '/week' });
    }

    for (const job of jobs) {
      const when = combine(date, job.time);
      if (when <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: job.title, body: job.body, data: { url: job.url } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fromLocal(when), channelId: CHANNEL },
      });
    }
  }
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}
