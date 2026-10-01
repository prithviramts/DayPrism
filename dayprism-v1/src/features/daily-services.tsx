import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '../auth/session';
import { fmtDate } from '../lib/time';
import { getStreak } from '../services/streaks';
import { useApp } from '../ui/app-state';
import { refreshWidgets } from '../widget/task-handler';
import { loadWidgetTiles, plain, saveWidgetSnapshot } from '../widget/snapshot';
import { WIDGET_SLOTS, catalog, loadTileData, resolveTiles, tileValue } from './tiles';
import { importFromHealthConnect } from './health-connect';
import { useAppLockEnabled } from './lock';
import { rescheduleReminders } from './reminders';

/**
 * Background chores for the signed-in user, re-run whenever data changes:
 *  - refresh the home-screen widgets' summary of today (chosen tiles and the streak)
 *  - rebuild reminders (so ones you no longer need are skipped)
 *  - open the right screen when a reminder is tapped
 * Renders nothing.
 */
export function DailyServices() {
  const { status } = useAuth();
  const { revision, today, settings, changed } = useApp();
  const locked = useAppLockEnabled();
  const ready = status === 'ready';
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (timer.current) clearTimeout(timer.current);
    // Debounced: several quick edits only cause one refresh.
    timer.current = setTimeout(async () => {
      try {
        // Health Connect import is throttled inside; it only writes when something changed.
        if ((await importFromHealthConnect().catch(() => 0)) > 0) {
          changed();
          return;
        }
        const [data, streak, widgetTiles] = await Promise.all([loadTileData(today, settings), getStreak(today), loadWidgetTiles()]);
        const defs = catalog(settings, data.trackers);
        await saveWidgetSnapshot({
          version: 2,
          date: today,
          tiles: resolveTiles(widgetTiles, defs, WIDGET_SLOTS).map((d) => {
            const v = tileValue(d, data, settings);
            return {
              id: d.id, label: plain(d.name), value: plain(v.value), sub: plain(v.sub), span: d.span,
              action: v.action, progress: v.progress, done: v.done, over: v.over,
            };
          }),
          streak: {
            current: streak.current,
            longest: streak.longest,
            loggedToday: streak.loggedToday,
            week: streak.lastSeven.map((d) => ({ label: fmtDate(d.date, 'ddd').slice(0, 1), logged: d.logged })),
          },
          locked,
        });
        await refreshWidgets();
        await rescheduleReminders(data.day, streak);
      } catch {
        // Widget and reminders are conveniences; never let them break the app.
      }
    }, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [ready, revision, today, settings, locked, changed]);

  // Tapping a reminder opens the matching entry form.
  useEffect(() => {
    if (!ready) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      // In-app paths only ("/quick?action=…"), so the same reminder works in every version of the app.
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    };
    Notifications.getLastNotificationResponseAsync().then(open, () => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [ready]);

  return null;
}
