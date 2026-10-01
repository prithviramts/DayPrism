import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { addMonths, duration, firstWeekday, fmtDate } from '../../lib/time';
import { CalendarDay, getMonth } from '../../services/calendar';
import { useApp, useData } from '../../ui/app-state';
import { Card, IconButton, Loading, Screen, Segmented, Txt } from '../../ui/kit';
import { radius, space, Theme, useTheme } from '../../ui/theme';

type ColorBy = 'rating' | 'energy' | 'sleep';

/** Column headings, starting on the phone's first day of the week. */
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => 'SMTWTFS'[(firstWeekday + i) % 7]);

/** 1–5 level for a day under the chosen measure, or null when there's nothing to show. */
function levelOf(d: CalendarDay, by: ColorBy): number | null {
  if (by === 'rating') return d.dayRating;
  if (by === 'energy') return d.avgEnergy == null ? null : Math.min(5, Math.max(1, Math.round(d.avgEnergy)));
  if (d.sleepHours == null) return null;
  return d.sleepHours < 5 ? 1 : d.sleepHours < 6 ? 2 : d.sleepHours < 7 ? 3 : d.sleepHours < 8 ? 4 : 5;
}

export default function HistoryScreen() {
  const t = useTheme();
  const { today } = useApp();
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [by, setBy] = useState<ColorBy>('rating');
  const { data: days } = useData(() => getMonth(month), [month]);
  const isCurrentMonth = month === `${today.slice(0, 7)}-01`;

  const inMonth = days?.filter((d) => d.inMonth && d.hasData) ?? [];

  return (
    <Screen title="History" subtitle="Your days at a glance">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
          <IconButton icon="chevron-left" label="Previous month" onPress={() => setMonth(addMonths(month, -1))} />
          <Txt variant="heading" style={{ flex: 1, textAlign: 'center' }}>{fmtDate(month, 'MMMM yyyy')}</Txt>
          <IconButton icon="chevron-right" label="Next month" onPress={() => !isCurrentMonth && setMonth(addMonths(month, 1))}
            color={isCurrentMonth ? t.grid : undefined} />
        </View>

        <View style={{ flexDirection: 'row' }}>
          {WEEKDAYS.map((w, i) => (
            <Txt key={i} variant="caption" style={{ flex: 1, textAlign: 'center', marginBottom: space.sm }}>{w}</Txt>
          ))}
        </View>

        {!days ? <Loading /> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {days.map((d) => <DayCell key={d.date} d={d} level={levelOf(d, by)} t={t} />)}
          </View>
        )}

        <View style={{ marginTop: space.lg }}>
          <Segmented<ColorBy>
            options={[{ value: 'rating', label: 'Day rating' }, { value: 'energy', label: 'Energy' }, { value: 'sleep', label: 'Sleep' }]}
            value={by} onChange={setBy} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: space.md }}>
            <Txt variant="caption">{by === 'sleep' ? '<5h' : 'Low'}</Txt>
            {t.lvl.map((c, i) => <View key={i} style={{ width: 22, height: 10, borderRadius: 3, backgroundColor: c }} />)}
            <Txt variant="caption">{by === 'sleep' ? '8h+' : 'High'}</Txt>
          </View>
        </View>
      </Card>

      <Card style={{ marginTop: space.md, flexDirection: 'row' }}>
        <Stat label="Days logged" value={String(inMonth.length)} />
        <Stat label="Avg rating" value={avgStr(inMonth.map((d) => d.dayRating))} />
        <Stat label="Avg sleep" value={(() => {
          const s = inMonth.map((d) => d.sleepHours).filter((x): x is number => x != null);
          return s.length ? duration(s.reduce((a, b) => a + b, 0) / s.length) : '–';
        })()} />
      </Card>
      <Txt variant="caption" style={{ textAlign: 'center', marginTop: space.md }}>Tap a day to see and edit everything you logged.</Txt>
    </Screen>
  );
}

const avgStr = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '–';
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Txt variant="number">{value}</Txt>
      <Txt variant="caption">{label}</Txt>
    </View>
  );
}

function DayCell({ d, level, t }: { d: CalendarDay; level: number | null; t: Theme }) {
  const bg = level ? t.lvl[level - 1] : 'transparent';
  const ink = level ? t.lvlInk[level - 1] : d.inMonth ? t.text : t.muted;
  return (
    <View style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }}>
      <Pressable
        disabled={d.isFuture}
        onPress={() => router.push(`/day/${d.date}`)}
        accessibilityLabel={`${fmtDate(d.date, 'dddd d MMMM')}${d.hasData ? '' : ', nothing logged'}`}
        style={({ pressed }) => ({
          flex: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
          backgroundColor: bg, opacity: d.isFuture ? 0.3 : !d.inMonth ? 0.45 : pressed ? 0.7 : 1,
          borderWidth: d.isToday ? 2 : 0, borderColor: t.accent,
        })}
      >
        <Txt variant="label" color={ink} style={{ fontSize: 14 }}>{Number(d.date.slice(8))}</Txt>
        {d.hasData && !level ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: t.muted, marginTop: 2 }} /> : null}
        {d.period ? (
          <View accessibilityLabel="period day"
            style={{ position: 'absolute', bottom: 4, width: 14, height: 3, borderRadius: 2, backgroundColor: t.tracker.pink }} />
        ) : null}
      </Pressable>
    </View>
  );
}
