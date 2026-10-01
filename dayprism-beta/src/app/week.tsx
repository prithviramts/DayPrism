import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FLAME, WeekDots } from '../features/streak-ui';
import { addDays, fmtDate } from '../lib/time';
import { getStreak } from '../services/streaks';
import { WeekMetric, buildWeek, weekStart } from '../services/week';
import { useApp, useData } from '../ui/app-state';
import { Button, Card, Divider, Icon, IconBadge, Loading, Page, Section, Segmented, Txt } from '../ui/kit';
import { alpha, space, useTheme } from '../ui/theme';

/** Your week: streak, the numbers that matter compared with last week, and your best day. */
export default function WeekScreen() {
  const t = useTheme();
  const { settings, today } = useApp();
  const [which, setWhich] = useState<'this' | 'last'>('this');
  const start = which === 'this' ? weekStart(today) : addDays(weekStart(today), -7);
  const { data } = useData(async () => {
    const [week, streak] = await Promise.all([buildWeek(start, settings, today), getStreak(today)]);
    return { week, streak };
  }, [start, settings, today]);

  return (
    <Page title="Your week">
      <Segmented options={[{ value: 'this', label: 'This week' }, { value: 'last', label: 'Last week' }]} value={which} onChange={setWhich} />
      {!data ? <Loading /> : (
        <>
          <Txt variant="caption" style={{ marginTop: space.md }}>
            {fmtDate(data.week.from, 'd MMM')} – {fmtDate(data.week.to, 'd MMM')}
            {which === 'this' ? ' · compared with the same days last week' : ' · compared with the week before'}
          </Txt>

          {/* streak */}
          <Card style={{ marginTop: space.md, gap: space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: alpha(FLAME, 0.14), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="fire" size={32} color={data.streak.loggedToday ? FLAME : t.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="display">{data.streak.current} day{data.streak.current === 1 ? '' : 's'}</Txt>
                <Txt variant="caption">
                  {data.streak.loggedToday ? 'Today is logged.' : data.streak.current > 0 ? 'Log anything today to keep it going.' : 'Log anything today to start a streak.'}
                  {data.streak.longest > data.streak.current ? `  Best: ${data.streak.longest} days.` : data.streak.current > 1 ? '  Your best yet!' : ''}
                </Txt>
              </View>
            </View>
            <WeekDots streak={data.streak} />
          </Card>

          <Section title="At a glance" hint={`${data.week.daysLogged} of ${data.week.daysSoFar} days logged`}>
            {data.week.metrics.length === 0 ? (
              <Card><Txt variant="body" color={t.text2}>Nothing logged this week yet. Your summary fills in as you go.</Txt></Card>
            ) : (
              <Card padded={false} style={{ paddingHorizontal: space.lg }}>
                {data.week.metrics.map((m, i) => (
                  <View key={m.key}>
                    {i > 0 ? <Divider /> : null}
                    <MetricRow m={m} />
                  </View>
                ))}
              </Card>
            )}
          </Section>

          {data.week.best ? (
            <Section title="Best day">
              <Card onPress={() => router.push(`/day/${data.week.best!.day.date}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <IconBadge icon="trophy-outline" color={t.tint.meal} />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">{fmtDate(data.week.best.day.date, 'dddd d MMM')}</Txt>
                  <Txt variant="caption">{data.week.best.why}</Txt>
                </View>
                <Icon name="chevron-right" size={20} color={t.muted} />
              </Card>
            </Section>
          ) : null}

          <Button title="Full review and patterns" kind="secondary" icon="notebook-outline" style={{ marginTop: space.xl }}
            onPress={() => router.push('/review')} />
        </>
      )}
    </Page>
  );
}

function MetricRow({ m }: { m: WeekMetric }) {
  const t = useTheme();
  let change: { text: string; color: string; icon: string } | null = null;
  if (m.value != null && m.previous != null && m.previous !== 0) {
    const pct = ((m.value - m.previous) / Math.abs(m.previous)) * 100;
    if (Math.abs(pct) >= 3) {
      const good = (pct > 0) === (m.better === 'up');
      change = { text: `${Math.abs(Math.round(pct))}%`, color: good ? t.success : t.danger, icon: pct > 0 ? 'arrow-up' : 'arrow-down' };
    } else {
      change = { text: 'steady', color: t.muted, icon: 'minus' };
    }
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
      <IconBadge icon={m.icon} color={t.accent} size={34} />
      <View style={{ flex: 1 }}>
        <Txt variant="caption">{m.label}</Txt>
        <Txt variant="bodyStrong">{m.value != null ? m.format(m.value) : '–'}</Txt>
        {m.note ? <Txt variant="caption" style={{ fontSize: 12 }}>{m.note}</Txt> : null}
      </View>
      {change ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Icon name={change.icon} size={14} color={change.color} />
          <Txt variant="label" color={change.color}>{change.text}</Txt>
        </View>
      ) : null}
    </View>
  );
}
