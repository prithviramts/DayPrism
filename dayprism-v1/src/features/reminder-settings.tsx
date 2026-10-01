import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { showTime, uses24h } from '../lib/time';
import { getDay } from '../services/day';
import { getStreak } from '../services/streaks';
import { useApp } from '../ui/app-state';
import { Card, Divider, Icon, IconBadge, Toggle, Txt } from '../ui/kit';
import { radius, space, useTheme } from '../ui/theme';
import {
  DEFAULT_REMINDERS, ReminderSettings, ensureNotificationPermission, loadReminderSettings, rescheduleReminders, saveReminderSettings,
} from './reminders';

/** Settings → Reminders: a master switch, then each reminder with its time(s). */
export function ReminderSettingsCard() {
  const t = useTheme();
  const { today } = useApp();
  const [s, setS] = useState<ReminderSettings>(DEFAULT_REMINDERS);

  useEffect(() => { loadReminderSettings().then(setS); }, []);

  const apply = async (next: ReminderSettings) => {
    if (next.enabled && !s.enabled && !(await ensureNotificationPermission())) {
      Alert.alert(
        'Notifications are off for DayPrism',
        'Allow notifications in your phone\'s settings to get reminders.',
        [{ text: 'Not now', style: 'cancel' }, { text: 'Open settings', onPress: () => Linking.openSettings() }],
      );
      return;
    }
    setS(next);
    await saveReminderSettings(next);
    await rescheduleReminders(await getDay(today).catch(() => null), await getStreak(today).catch(() => null));
  };

  const pickTime = (value: string, onPick: (v: string) => void) => {
    const [h, m] = value.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    DateTimePickerAndroid.open({
      value: d, mode: 'time', is24Hour: uses24h,
      onValueChange: (_e, picked) => {
        if (picked) onPick(`${String(picked.getHours()).padStart(2, '0')}:${String(picked.getMinutes()).padStart(2, '0')}`);
      },
    });
  };

  const chip = (value: string, onPick: (v: string) => void, enabled: boolean, key = 0) => (
    <Pressable key={key} disabled={!enabled} onPress={() => pickTime(value, onPick)}
      accessibilityRole="button" accessibilityLabel={`Reminder at ${showTime(value)}, tap to change`}
      style={({ pressed }) => ({
        paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: t.surface2,
        opacity: !enabled ? 0.45 : pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: 4,
      })}>
      <Icon name="clock-outline" size={14} color={t.text2} />
      <Txt variant="label">{showTime(value)}</Txt>
    </Pressable>
  );

  const row = (icon: string, color: string, title: string, sub: string, on: boolean, toggle: (v: boolean) => void, times: React.ReactNode) => (
    <View style={{ paddingVertical: space.md, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconBadge icon={icon} color={color} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{title}</Txt>
          <Txt variant="caption">{sub}</Txt>
        </View>
        <Toggle value={on && s.enabled} onValueChange={toggle} disabled={!s.enabled} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', marginLeft: 48 }}>{times}</View>
    </View>
  );

  return (
    <Card padded={false} style={{ paddingHorizontal: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
        <IconBadge icon="bell-ring-outline" color={t.accent} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">Daily reminders</Txt>
          <Txt variant="caption">Skipped automatically when you&apos;ve already logged.</Txt>
        </View>
        <Toggle value={s.enabled} onValueChange={(v) => apply({ ...s, enabled: v })} />
      </View>
      <Divider />
      {row('weather-night', t.tint.sleep, 'Log last night\'s sleep', 'Morning', s.sleep.on,
        (v) => apply({ ...s, sleep: { ...s.sleep, on: v } }),
        chip(s.sleep.time, (v) => apply({ ...s, sleep: { ...s.sleep, time: v } }), s.enabled && s.sleep.on))}
      <Divider />
      {row('lightning-bolt', t.tint.checkin, 'Energy check-ins', 'Through the day', s.checkIns.on,
        (v) => apply({ ...s, checkIns: { ...s.checkIns, on: v } }),
        s.checkIns.times.map((time, i) => chip(time, (v) => {
          const times = [...s.checkIns.times];
          times[i] = v;
          apply({ ...s, checkIns: { ...s.checkIns, times: times.sort() } });
        }, s.enabled && s.checkIns.on, i)))}
      <Divider />
      {row('pencil', t.tint.reflect, 'Evening reflection', 'Rate your day', s.reflection.on,
        (v) => apply({ ...s, reflection: { ...s.reflection, on: v } }),
        chip(s.reflection.time, (v) => apply({ ...s, reflection: { ...s.reflection, time: v } }), s.enabled && s.reflection.on))}
      <Divider />
      {row('fire', t.tracker.orange, 'Streak saver', "Only if you haven't logged that day", s.streak.on,
        (v) => apply({ ...s, streak: { ...s.streak, on: v } }),
        chip(s.streak.time, (v) => apply({ ...s, streak: { ...s.streak, time: v } }), s.enabled && s.streak.on))}
      <Divider />
      {row('calendar-week', t.accent, 'Weekly summary', 'Last day of your week', s.weekly.on,
        (v) => apply({ ...s, weekly: { ...s.weekly, on: v } }),
        chip(s.weekly.time, (v) => apply({ ...s, weekly: { ...s.weekly, time: v } }), s.enabled && s.weekly.on))}
    </Card>
  );
}
