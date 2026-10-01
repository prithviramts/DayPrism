import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { DayTimeline, ReflectionCard } from '../../features/day-views';
import { SleepSuggestion } from '../../features/health-connect-ui';
import { ReminderPrompt } from '../../features/reminder-prompt';
import { MilestoneCelebration, StreakChip } from '../../features/streak-ui';
import { HOME_SLOTS, catalog, defaultHomeTiles, loadTileData, resolveTiles } from '../../features/tiles';
import { TileEditor, TileGrid } from '../../features/tiles-ui';
import { activityIcon, activityName } from '../../lib/domain';
import { duration, fmtDate, greeting, hoursBetween, nowLocal, showTime } from '../../lib/time';
import * as entries from '../../services/entries';
import { getStreak } from '../../services/streaks';
import { useApp, useData } from '../../ui/app-state';
import { Card, Icon, Loading, Screen, Section, Txt, tap } from '../../ui/kit';
import { alpha, radius, space, useTheme } from '../../ui/theme';

// Today: your chosen tiles (up to 8 slots, tap to log), then the day as a timeline.
// Everything else (stats, charts, history) lives on the other tabs, so this screen stays calm.

export default function TodayScreen() {
  const { settings, updateSettings, today } = useApp();
  const [editing, setEditing] = useState(false);
  const { data } = useData(async () => {
    const [tiles, streak] = await Promise.all([loadTileData(today, settings), getStreak(today)]);
    return { tiles, streak };
  }, [today, settings]);

  if (!data) return <Screen><Loading /></Screen>;
  const { tiles: tileData, streak } = data;
  const { day } = tileData;
  const defs = catalog(settings, tileData.trackers);
  const defaults = defaultHomeTiles(settings, defs);
  const chosen = resolveTiles(settings.homeTiles ?? defaults, defs, HOME_SLOTS);

  return (
    <Screen subtitle={fmtDate(today, 'dddd d MMMM')} title={greeting(settings.displayName)} right={<StreakChip streak={streak} />}>
      {day.running ? <RunningBar id={day.running.id} start={day.running.startTime} category={day.running.category} /> : null}

      {!day.sleep ? <SleepSuggestion /> : null}
      <ReminderPrompt />

      <Section title="Your day" hint="long-press for more" action={{ label: 'Customize', onPress: () => setEditing(true) }}>
        <TileGrid tiles={chosen} data={tileData} />
      </Section>

      <Section title="Timeline" hint="tap to edit">
        <DayTimeline day={day} emptyText="Tap a tile to log your first thing today." />
      </Section>

      {day.reflection ? (
        <Section title="Reflection">
          <ReflectionCard day={day} />
        </Section>
      ) : null}

      {editing ? (
        <TileEditor
          title="Customize Today"
          intro="Pick what you track every day. Most tiles take one slot; richer ones like the cycle take two."
          slots={HOME_SLOTS}
          defs={defs}
          value={chosen.map((d) => d.id)}
          defaults={defaults}
          onSave={(ids) => updateSettings({ homeTiles: ids })}
          onClose={() => setEditing(false)}
        />
      ) : null}
      <MilestoneCelebration streak={streak} />
    </Screen>
  );
}

/** The running activity with a live elapsed time and a Stop button. */
function RunningBar({ id, start, category }: { id: string; start: string; category: Parameters<typeof activityName>[0] }) {
  const t = useTheme();
  const { changed } = useApp();
  const [now, setNow] = useState(nowLocal());
  useEffect(() => {
    const timer = setInterval(() => setNow(nowLocal()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const stop = async () => {
    tap();
    try {
      await entries.stopActivity(id, nowLocal());
      changed();
    } catch (e) {
      Alert.alert('Could not stop', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card style={{ marginTop: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md, borderColor: alpha(t.success, 0.5) }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: alpha(t.success, 0.14), alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={activityIcon(category)} size={20} color={t.success} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{activityName(category)}</Txt>
        <Txt variant="caption">since {showTime(start)} · {duration(hoursBetween(start, now))}</Txt>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Stop ${activityName(category)}`}
        onPress={stop}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.lg, paddingVertical: 10,
          borderRadius: radius.pill, backgroundColor: t.dangerSoft, opacity: pressed ? 0.8 : 1,
        })}
      >
        <Icon name="stop" size={16} color={t.danger} />
        <Txt variant="label" color={t.danger}>Stop</Txt>
      </Pressable>
    </Card>
  );
}
