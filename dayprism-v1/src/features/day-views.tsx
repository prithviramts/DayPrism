import { Pressable, View } from 'react-native';

import { duration } from '../lib/time';
import { sleepHours } from '../lib/domain';
import { DayEntry, DaySnapshot, dayEntries } from '../services/day';
import { useApp } from '../ui/app-state';
import { Card, Empty, Icon, IconBadge, Ring, Txt } from '../ui/kit';
import { alpha, radius, space, useTheme } from '../ui/theme';
import { SheetRequest, useEntrySheets } from './entry-sheets';

/** The four daily totals, each with a ring towards its target. Shared by Today and day detail. */
export function DayStats({ day }: { day: DaySnapshot }) {
  const t = useTheme();
  const { settings: s } = useApp();
  const hours = day.sleep ? sleepHours(day.sleep) : 0;

  const tile = (ring: React.ReactNode, label: string, value: string, unit: string, sub: string) => (
    <Card style={{ flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md }}>
      {ring}
      <View style={{ flex: 1 }}>
        <Txt variant="caption">{label}</Txt>
        <Txt variant="number" numberOfLines={1}>
          {value}{unit ? <Txt variant="caption"> {unit}</Txt> : null}
        </Txt>
        <Txt variant="caption" numberOfLines={1}>{sub}</Txt>
      </View>
    </Card>
  );

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {tile(<Ring progress={hours / s.sleepTargetHours} color={t.tint.sleep} icon="weather-night" />,
        'Sleep', day.sleep ? duration(hours) : '–', '', day.sleep ? `quality ${day.sleep.quality}/5` : `${s.sleepTargetHours}h goal`)}
      {tile(<Ring progress={day.caffeineMg / s.caffeineLimitMg} color={t.tint.caffeine} icon="coffee" over={day.caffeineMg > s.caffeineLimitMg} />,
        'Caffeine', String(day.caffeineMg), 'mg', `of ${s.caffeineLimitMg} mg max`)}
      {tile(<Ring progress={day.mealsEaten / s.mealsTarget} color={t.tint.meal} icon="silverware-fork-knife" />,
        'Meals', String(day.mealsEaten), `of ${s.mealsTarget}`, day.mealsSkipped ? `${day.mealsSkipped} skipped` : 'eaten')}
      {tile(<Ring progress={day.waterGlasses / s.waterTargetGlasses} color={t.tint.water} icon="water" />,
        'Water', String(day.waterGlasses), `of ${s.waterTargetGlasses}`, 'glasses')}
      {day.steps != null ? (
        <Card style={{ flexBasis: '100%', flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md }}>
          <Ring progress={day.steps / s.stepsTarget} color={t.fam.exercise} icon="shoe-print" />
          <View style={{ flex: 1 }}>
            <Txt variant="caption">Steps</Txt>
            <Txt variant="number">{day.steps.toLocaleString()}<Txt variant="caption"> of {s.stepsTarget.toLocaleString()}</Txt></Txt>
            <Txt variant="caption">from Health Connect</Txt>
          </View>
        </Card>
      ) : null}
    </View>
  );
}

/** The day as a vertical timeline. Tap any entry to edit it. */
export function DayTimeline({ day, emptyText }: { day: DaySnapshot; emptyText?: string }) {
  const t = useTheme();
  const { open } = useEntrySheets();
  const rows = dayEntries(day);

  if (rows.length === 0) {
    return (
      <Card>
        <Empty icon="timeline-outline" title="Nothing logged yet" text={emptyText ?? 'Entries you add will show up here in time order.'} />
      </Card>
    );
  }

  const edit = (r: DayEntry) => open((r.kind === 'tracker' ? { kind: 'tracker', ...(r.entry as object) } : { kind: r.kind, entry: r.entry }) as SheetRequest);

  return (
    <Card padded={false} style={{ paddingVertical: space.sm }}>
      {rows.map((r, i) => {
        const color = r.trackerColor ? t.tracker[r.trackerColor] ?? t.accent : t.tint[r.tint];
        const last = i === rows.length - 1;
        return (
          <Pressable
            key={`${r.kind}-${r.id}`}
            onPress={() => edit(r)}
            accessibilityRole="button"
            accessibilityHint="Edit this entry"
            style={({ pressed }) => ({ flexDirection: 'row', paddingHorizontal: space.lg, backgroundColor: pressed ? t.surface2 : 'transparent' })}
          >
            <Txt variant="caption" style={{ width: 44, paddingTop: space.md + 9, fontVariant: ['tabular-nums'] }}>{r.clock}</Txt>
            <View style={{ alignItems: 'center', width: 36 }}>
              <View style={{ width: 2, height: space.md, backgroundColor: i === 0 ? 'transparent' : t.grid }} />
              <IconBadge icon={r.icon} color={color} size={34} />
              <View style={{ width: 2, flex: 1, backgroundColor: last ? 'transparent' : t.grid }} />
            </View>
            <View style={{ flex: 1, paddingLeft: space.md, paddingVertical: space.md }}>
              <Txt variant="bodyStrong">
                {r.title}
                {r.running ? <Txt variant="caption" color={t.success}>  ● running</Txt> : null}
              </Txt>
              {r.detail ? <Txt variant="caption" style={{ marginTop: 2 }}>{r.detail}</Txt> : null}
            </View>
            <View style={{ justifyContent: 'center' }}>
              <Icon name="pencil-outline" size={16} color={t.muted} />
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

/** The day's reflection, or a prompt to write one. */
export function ReflectionCard({ day }: { day: DaySnapshot }) {
  const t = useTheme();
  const { open } = useEntrySheets();
  const r = day.reflection;
  if (!r) {
    return (
      <Card onPress={() => open({ kind: 'reflection', date: day.date })} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconBadge icon="pencil" color={t.tint.reflect} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">Reflect on the day</Txt>
          <Txt variant="caption">What went well, what didn&apos;t, and a rating</Txt>
        </View>
        <Icon name="chevron-right" size={20} color={t.muted} />
      </Card>
    );
  }
  const line = (label: string, text: string | null) => text ? (
    <View style={{ marginTop: space.sm }}>
      <Txt variant="caption">{label}</Txt>
      <Txt variant="body">{text}</Txt>
    </View>
  ) : null;
  return (
    <Card onPress={() => open({ kind: 'reflection', entry: r })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Txt variant="heading" style={{ flex: 1 }}>Reflection</Txt>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <View key={n} style={{ width: 18, height: 6, borderRadius: radius.pill, backgroundColor: n <= r.dayRating ? t.tint.reflect : alpha(t.tint.reflect, 0.18) }} />
          ))}
        </View>
        <Txt variant="label">{r.dayRating}/5</Txt>
      </View>
      {line('Went well', r.wentWell)}
      {line("Didn't go well", r.didntGoWell)}
      {line('Tomorrow', r.doDifferently)}
    </Card>
  );
}
