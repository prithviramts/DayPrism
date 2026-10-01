import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { getDay } from '../services/day';
import { useApp } from '../ui/app-state';
import { Button, Card, IconBadge, Txt } from '../ui/kit';
import { space, useTheme } from '../ui/theme';
import { ensureNotificationPermission, loadReminderSettings, rescheduleReminders, saveReminderSettings } from './reminders';

const ASKED = 'dayprism.reminders.asked';

/** A one-time card on Today offering reminders. Shown until the user answers either way. */
export function ReminderPrompt() {
  const t = useTheme();
  const { today } = useApp();
  const [show, setShow] = useState(false);

  useEffect(() => {
    (async () => {
      const asked = await SecureStore.getItemAsync(ASKED).catch(() => '1');
      const s = await loadReminderSettings();
      setShow(!asked && !s.enabled);
    })();
  }, []);

  if (!show) return null;

  const answer = async (yes: boolean) => {
    setShow(false);
    await SecureStore.setItemAsync(ASKED, '1');
    if (!yes || !(await ensureNotificationPermission())) return;
    await saveReminderSettings({ ...(await loadReminderSettings()), enabled: true });
    await rescheduleReminders(await getDay(today).catch(() => null));
  };

  return (
    <Card style={{ marginTop: space.md, gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <IconBadge icon="bell-ring-outline" color={t.accent} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">Want a gentle nudge?</Txt>
          <Txt variant="caption" style={{ fontSize: 13, lineHeight: 18 }}>
            A morning sleep log, three quick check-ins and an evening reflection. Skipped when you&apos;ve already logged.
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Not now" kind="secondary" compact onPress={() => answer(false)} style={{ flex: 1 }} />
        <Button title="Turn on reminders" compact onPress={() => answer(true)} style={{ flex: 2 }} />
      </View>
    </Card>
  );
}
