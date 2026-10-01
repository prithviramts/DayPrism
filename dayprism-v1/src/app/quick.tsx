import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ToastAndroid } from 'react-native';

import { SheetRequest, useEntrySheets } from '../features/entry-sheets';
import { nowLocal } from '../lib/time';
import { saveWater } from '../services/entries';
import { clearDay, logTracker, trackersForDay } from '../services/trackers';
import { useApp } from '../ui/app-state';
import { Loading } from '../ui/kit';

/**
 * Shortcut target for widget tiles and reminder taps: dayprism://quick?action=…
 *   water                 logs a glass straight away
 *   tracker&id=…          adds one (count) or ticks (yes/no) straight away; other kinds open the form
 *   anything else         opens that entry form on top of Today
 */
export default function QuickAction() {
  const { action, id } = useLocalSearchParams<{ action?: string; id?: string }>();
  const { open } = useEntrySheets();
  const { changed, today } = useApp();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      router.replace('/');
      if (action === 'water') {
        await saveWater(null, { time: nowLocal(), glasses: 1 });
        changed();
        ToastAndroid.show('+1 glass of water logged', ToastAndroid.SHORT);
        return;
      }
      if (action === 'tracker' && id) {
        const item = (await trackersForDay(today)).find((x) => x.tracker.id === id);
        if (!item) return;
        const { tracker, value } = item;
        if (tracker.kind === 'count' || tracker.kind === 'check') {
          if (tracker.kind === 'check' && value != null) await clearDay(tracker.id, today);
          else await logTracker(tracker, 1, nowLocal());
          changed();
          ToastAndroid.show(tracker.kind === 'count' ? `${tracker.name} +1` : `${tracker.name} ${value != null ? 'cleared' : 'done'}`, ToastAndroid.SHORT);
        } else {
          open({ kind: 'tracker', tracker, date: today });
        }
        return;
      }
      const kinds: Record<string, SheetRequest['kind']> = {
        checkin: 'checkin', sleep: 'sleep', reflection: 'reflection', meal: 'meal', caffeine: 'caffeine', activity: 'activity', cycle: 'cycle',
      };
      const kind = action ? kinds[action] : undefined;
      if (kind) open({ kind, date: today } as SheetRequest);
    })();
  }, [action, id, open, changed, today]);

  return <Loading />;
}
