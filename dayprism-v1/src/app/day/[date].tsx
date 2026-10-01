import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CycleCard } from '../../features/cycle-ui';
import { DayStats, DayTimeline, ReflectionCard } from '../../features/day-views';
import { SheetRequest, useEntrySheets } from '../../features/entry-sheets';
import { TrackersRow } from '../../features/trackers-ui';
import { addDays, fmtDate } from '../../lib/time';
import { getDay } from '../../services/day';
import { useApp, useData } from '../../ui/app-state';
import { Icon, IconButton, Loading, Section, Txt } from '../../ui/kit';
import { alpha, contentColumn, radius, space, useTheme } from '../../ui/theme';

/** One day from History: totals, every entry (tap to edit), reflection, and adding entries after the fact. */
export default function DayScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date: string }>();
  const { today, settings } = useApp();
  const { open } = useEntrySheets();
  const { data: day } = useData(() => getDay(date), [date]);
  const isToday = date === today;

  const add = (kind: SheetRequest['kind'], icon: string, label: string, color: string) => (
    <Pressable
      key={kind}
      onPress={() => open({ kind, date } as SheetRequest)}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 8,
        borderRadius: radius.pill, backgroundColor: alpha(color, 0.12), opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} size={16} color={color} />
      <Txt variant="label" color={t.text}>{label}</Txt>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingVertical: space.sm }}>
        <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="heading">{fmtDate(date, 'dddd d MMMM')}</Txt>
          {isToday ? <Txt variant="caption">Today</Txt> : null}
        </View>
        <IconButton icon="chevron-left" label="Previous day" onPress={() => router.setParams({ date: addDays(date, -1) })} />
        <IconButton icon="chevron-right" label="Next day" color={isToday ? t.grid : undefined}
          onPress={() => !isToday && router.setParams({ date: addDays(date, 1) })} />
      </View>

      {!day ? <Loading /> : (
        <ScrollView contentContainerStyle={[{ padding: space.lg, paddingBottom: insets.bottom + space.xxl }, contentColumn]}>
          <DayStats day={day} />

          {settings.cycleTracking ? (
            <Section title="Cycle">
              <CycleCard date={date} />
            </Section>
          ) : null}

          <Section title="Trackers" action={{ label: 'Manage', onPress: () => router.push('/trackers') }}>
            <TrackersRow date={date} />
          </Section>

          <Section title="Add to this day">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {add('checkin', 'lightning-bolt', 'Check-in', t.tint.checkin)}
              {add('meal', 'silverware-fork-knife', 'Meal', t.tint.meal)}
              {add('caffeine', 'coffee', 'Caffeine', t.tint.caffeine)}
              {add('water', 'water', 'Water', t.tint.water)}
              {add('activity', 'play', 'Activity', t.tint.activity)}
              {!day.sleep ? add('sleep', 'weather-night', 'Sleep', t.tint.sleep) : null}
            </View>
          </Section>

          <Section title="Entries" hint="tap to edit">
            <DayTimeline day={day} emptyText="Nothing was logged on this day. Add entries above." />
          </Section>

          <Section title="Reflection">
            <ReflectionCard day={day} />
          </Section>
        </ScrollView>
      )}
    </View>
  );
}
