import { ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CycleInsightCard } from '../../features/cycle-ui';
import { FAMILIES } from '../../lib/domain';
import { addDays, clockFromHour, duration, fmtDate, showTime } from '../../lib/time';
import { Takeaway, buildInsights } from '../../services/insights';
import { buildTrackerInsights } from '../../services/tracker-insights';
import { formatValue } from '../../services/trackers';
import { useApp, useData } from '../../ui/app-state';
import { DayBars, GroupedBars, HourLines, RatingTrend, SleepWindows, StackedRows } from '../../ui/charts';
import { Card, Empty, Icon, Loading, Screen, Segmented, Txt } from '../../ui/kit';
import { space, useTheme } from '../../ui/theme';

const RANGES = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }];

export default function InsightsScreen() {
  const t = useTheme();
  const { today, settings } = useApp();
  const [days, setDays] = useState(30);
  const from = addDays(today, -(days - 1));
  const { data: r } = useData(() => buildInsights(from, today), [from, today]);

  const tile = (label: string, value: string) => (
    <Card style={{ flexBasis: '47%', flexGrow: 1, padding: space.md }}>
      <Txt variant="caption">{label}</Txt>
      <Txt variant="number" style={{ marginTop: 2 }}>{value}</Txt>
    </Card>
  );
  const one = (v: number | null) => (v == null ? '–' : v.toFixed(1));

  return (
    <Screen title="Insights" subtitle={`${fmtDate(from, 'd MMM')} – ${fmtDate(today, 'd MMM')}`}>
      <Segmented options={RANGES} value={days} onChange={setDays} />

      {!r ? <Loading /> : r.summary.daysLogged === 0 ? (
        <Card style={{ marginTop: space.lg }}>
          <Empty icon="chart-box-outline" title="No data in this period yet"
            text="Log check-ins, sleep, meals and caffeine for a few days and your patterns will appear here." />
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.lg }}>
            {tile('Days logged', `${r.summary.daysLogged}`)}
            {tile('Avg sleep', r.summary.avgSleepHours == null ? '–' : duration(r.summary.avgSleepHours))}
            {tile('Avg energy', `${one(r.summary.avgEnergy)} / 5`)}
            {tile('Avg day rating', `${one(r.summary.avgDayRating)} / 5`)}
          </View>

          <InsightCard title="Sleep" icon="weather-night" takeaway={r.sleepTakeaway}>
            <SleepWindows
              color={t.tint.sleep}
              label={(h) => showTime(clockFromHour(18 + h))}
              nights={r.nights.map((n) => ({
                key: n.date, label: fmtDate(n.date, 'ddd d MMM'), from: n.bed, to: n.wake,
                detail: `${showTime(clockFromHour(18 + n.bed))} → ${showTime(clockFromHour(18 + n.wake))} · ${duration(n.hours)} · quality ${n.quality}/5`,
              }))}
            />
          </InsightCard>

          <InsightCard title="Energy through the day" icon="lightning-bolt" takeaway={r.hourlyTakeaway}>
            <HourLines
              series={[{ label: 'Energy', color: t.series1 }, { label: 'Sleepiness', color: t.series2 }]}
              points={r.hourly.map((p) => ({ hour: p.hour, values: [p.energy, p.sleepiness], n: p.checkIns }))}
            />
          </InsightCard>

          <InsightCard title="Sleep vs that day's energy" icon="bed-outline" takeaway={r.sleepVsEnergyTakeaway}>
            <GroupedBars max={5}
              series={[{ label: 'Energy', color: t.series1 }, { label: 'Sleepiness', color: t.series2 }]}
              groups={r.sleepBuckets.map((b) => ({ label: b.label, days: b.days, values: [b.a, b.b] }))} />
          </InsightCard>

          <InsightCard title="Caffeine timing vs that night" icon="coffee" takeaway={r.caffeineTakeaway}>
            <GroupedBars max={Math.max(9, ...r.caffeineBuckets.map((b) => b.a ?? 0))}
              format={(v) => duration(v)}
              series={[{ label: 'Hours slept', color: t.tint.sleep }]}
              groups={r.caffeineBuckets.map((b) => ({ label: b.label, days: b.days, values: [b.a] }))} />
          </InsightCard>

          <InsightCard title="Breakfast vs morning energy" icon="bowl-mix-outline" takeaway={r.breakfastTakeaway}>
            <GroupedBars max={5}
              series={[{ label: 'Energy before noon', color: t.series1 }]}
              groups={r.breakfast.map((b) => ({ label: b.label, days: b.days, values: [b.a] }))} />
          </InsightCard>

          <InsightCard title="Where your time goes" icon="clock-outline" takeaway={r.activityTakeaway}>
            <StackedRows
              keys={FAMILIES.map((f) => ({ key: f.key, label: f.label, color: t.fam[f.key] }))}
              rows={r.weeks.filter((w) => Object.values(w.byFamily).some((v) => v > 0)).map((w) => ({
                label: `Week of ${fmtDate(w.weekStart, 'd MMM')}`, note: w.partial ? 'partial' : undefined, values: w.byFamily,
              }))}
            />
          </InsightCard>

          <InsightCard title="Day rating" icon="star-outline" takeaway={r.ratingTakeaway}>
            <RatingTrend color={t.tint.reflect}
              points={r.ratings.map((p) => ({ date: p.date, label: fmtDate(p.date, 'ddd d MMM'), rating: p.rating, rolling: p.rolling }))} />
          </InsightCard>

          {settings.cycleTracking ? <CycleInsightCard from={from} to={today} /> : null}
          <TrackerInsightsSection from={from} to={today} />

          <Txt variant="caption" style={{ marginTop: space.lg, textAlign: 'center' }}>
            These compare groups of your own days. They show patterns, not proof of cause and effect.
          </Txt>
        </>
      )}
    </Screen>
  );
}

/** A finding: one-sentence takeaway first, the chart behind it underneath. */
function InsightCard({ title, icon, takeaway, children, alwaysChart = false }: { title: string; icon: string; takeaway: Takeaway; children: ReactNode; alwaysChart?: boolean }) {
  const t = useTheme();
  const [showChart, setShowChart] = useState(true);
  const hasChart = takeaway.enough || alwaysChart;
  return (
    <Card style={{ marginTop: space.lg }}>
      <Pressable
        onPress={() => hasChart && setShowChart(!showChart)}
        disabled={!hasChart}
        accessibilityRole={hasChart ? 'button' : undefined}
        accessibilityLabel={hasChart ? `${title}, ${showChart ? 'hide' : 'show'} chart` : title}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
      >
        <Icon name={icon} size={18} color={t.accent} />
        <Txt variant="heading" style={{ flex: 1 }}>{title}</Txt>
        {hasChart ? (
          <Icon name={showChart ? 'chevron-up' : 'chevron-down'} size={20} color={t.muted} />
        ) : (
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: t.surface2 }}>
            <Txt variant="caption" style={{ fontSize: 11 }}>Needs more data</Txt>
          </View>
        )}
      </Pressable>
      <Txt variant="body" color={takeaway.enough ? t.text : t.muted} style={{ marginTop: space.sm, fontSize: 14, lineHeight: 20 }}>
        {takeaway.text}
      </Txt>
      {showChart && hasChart ? <View style={{ marginTop: space.md }}>{children}</View> : null}
    </Card>
  );
}

/** "Your trackers": one card per custom tracker, with its daily values and what it goes along with. */
function TrackerInsightsSection({ from, to }: { from: string; to: string }) {
  const t = useTheme();
  const { data } = useData(() => buildTrackerInsights(from, to), [from, to]);
  if (!data || data.length === 0) return null;

  return (
    <>
      <Txt variant="heading" style={{ marginTop: space.xl }}>Your trackers</Txt>
      {data.map((ti) => {
        const color = t.tracker[ti.tracker.color] ?? t.accent;
        const values = ti.days.map((d) => d.value).filter((v): v is number => v != null);
        const max = ti.tracker.kind === 'check' ? 1 : ti.tracker.kind === 'scale' ? 5 : Math.max(1, ...values);
        const min = ti.tracker.kind === 'measure' && values.length ? Math.min(...values) * 0.97 : 0;
        return (
          <InsightCard key={ti.tracker.id} title={ti.tracker.name} icon={ti.tracker.icon} takeaway={ti.takeaway} alwaysChart>
            <Txt variant="caption" style={{ marginBottom: space.sm }}>
              {ti.summary}{ti.goalDays ? ` · goal met on ${ti.goalDays.met} of ${ti.goalDays.counted} days` : ''}
            </Txt>
            {ti.daysLogged > 0 ? (
              <DayBars color={color} max={max} min={min}
                days={ti.days.map((d) => ({ label: fmtDate(d.date, 'ddd d MMM'), value: d.value }))}
                format={(v) => formatValue(ti.tracker, v)} />
            ) : null}
          </InsightCard>
        );
      })}
    </>
  );
}
