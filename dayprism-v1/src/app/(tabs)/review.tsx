import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { duration, fmtDate } from '../../lib/time';
import { shareCsv, shareReview } from '../../services/export';
import { NotableDay, avgOf, buildReview, daysLogged, presets } from '../../services/review';
import { useApp, useData } from '../../ui/app-state';
import { Button, Card, Divider, Empty, Icon, Loading, Row, Screen, Section, Segmented, Txt } from '../../ui/kit';
import { alpha, radius, space, useTheme } from '../../ui/theme';

export default function ReviewScreen() {
  const t = useTheme();
  const { today } = useApp();
  const options = presets(today);
  const [pick, setPick] = useState(1);
  const { from, to } = options[pick];
  const { data: r } = useData(() => buildReview(from, to), [from, to]);
  const [allReflections, setAllReflections] = useState(false);
  const [busy, setBusy] = useState(false);

  const share = async (what: 'review' | 'csv') => {
    setBusy(true);
    try {
      if (what === 'review') await shareReview(from, to);
      else await shareCsv(from, to);
    } catch (e) {
      Alert.alert('Could not export', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const one = (v: number | null) => (v == null ? '–' : v.toFixed(1));
  const reflections = r?.days.filter((d) => d.reflection).reverse() ?? [];

  return (
    <Screen title="Review" subtitle={`${fmtDate(from, 'd MMM')} – ${fmtDate(to, 'd MMM yyyy')}`}>
      <Segmented options={options.map((o, i) => ({ value: i, label: o.label }))} value={pick} onChange={setPick} />

      {!r ? <Loading /> : daysLogged(r) === 0 ? (
        <Card style={{ marginTop: space.lg }}>
          <Empty icon="notebook-outline" title="Nothing logged in this period" text="Your review builds itself from your entries and reflections." />
        </Card>
      ) : (
        <>
          <Card style={{ marginTop: space.lg, flexDirection: 'row' }}>
            {[
              ['Days logged', `${daysLogged(r)}/${r.days.length}`],
              ['Sleep', (() => { const v = avgOf(r, (d) => d.sleepHours); return v == null ? '–' : duration(v); })()],
              ['Energy', one(avgOf(r, (d) => d.avgEnergy))],
              ['Rating', one(avgOf(r, (d) => d.dayRating))],
            ].map(([label, value]) => (
              <View key={label} style={{ flex: 1, alignItems: 'center' }}>
                <Txt variant="number" style={{ fontSize: 18 }}>{value}</Txt>
                <Txt variant="caption">{label}</Txt>
              </View>
            ))}
          </Card>
          {r.demoRows > 0 ? (
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: alpha(t.tint.caffeine, 0.12) }}>
              <Icon name="flask-outline" size={18} color={t.tint.caffeine} />
              <Txt variant="caption" color={t.text2} style={{ flex: 1 }}>Includes {r.demoRows} demo entries. Remove them in Settings when you start for real.</Txt>
            </View>
          ) : null}

          <Section title="Streaks">
            <Card padded={false} style={{ paddingHorizontal: space.lg }}>
              {r.streaks.map((s, i) => (
                <View key={s.name}>
                  {i ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, gap: space.md }}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong">{s.name}</Txt>
                      <Txt variant="caption">{s.daysMet} of {s.daysCounted} {s.description} · best {s.longest}</Txt>
                    </View>
                    <View style={{ alignItems: 'center', minWidth: 54, paddingVertical: 6, borderRadius: radius.md, backgroundColor: s.current ? alpha(t.success, 0.14) : t.surface2 }}>
                      <Txt variant="number" style={{ fontSize: 18 }} color={s.current ? t.success : t.muted}>{s.current}</Txt>
                      <Txt variant="caption" style={{ fontSize: 10 }}>now</Txt>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          </Section>

          <Section title="Best days">
            <NotableList list={r.best} color={t.success} />
          </Section>
          <Section title="Hardest days">
            <NotableList list={r.hardest} color={t.danger} />
          </Section>

          <Section title="Reflections" hint={`${reflections.length} written`}>
            {reflections.length === 0 ? (
              <Card><Empty icon="pencil-outline" title="No reflections yet" text="End-of-day reflections show up here." /></Card>
            ) : (
              <Card padded={false} style={{ paddingHorizontal: space.lg }}>
                {(allReflections ? reflections : reflections.slice(0, 5)).map((d, i) => (
                  <View key={d.date}>
                    {i ? <Divider /> : null}
                    <View style={{ paddingVertical: space.md, gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Txt variant="label" onPress={() => router.push(`/day/${d.date}`)}>{fmtDate(d.date, 'ddd d MMM')}</Txt>
                        <Txt variant="label">{d.reflection!.dayRating}/5</Txt>
                      </View>
                      {d.reflection!.wentWell ? <Txt variant="body" style={{ fontSize: 14 }}>👍 {d.reflection!.wentWell}</Txt> : null}
                      {d.reflection!.didntGoWell ? <Txt variant="body" style={{ fontSize: 14 }}>👎 {d.reflection!.didntGoWell}</Txt> : null}
                      {d.reflection!.doDifferently ? <Txt variant="body" style={{ fontSize: 14 }} color={t.text2}>→ {d.reflection!.doDifferently}</Txt> : null}
                    </View>
                  </View>
                ))}
                {reflections.length > 5 ? (
                  <Button kind="ghost" compact title={allReflections ? 'Show fewer' : `Show all ${reflections.length}`} onPress={() => setAllReflections(!allReflections)} />
                ) : null}
              </Card>
            )}
          </Section>

          <Section title="Export">
            <Card>
              <Txt variant="caption" style={{ marginBottom: space.md, fontSize: 13, lineHeight: 18 }}>
                Share a written summary to paste into an AI assistant for honest feedback, or the raw entries as a spreadsheet.
                Files leave the app only when you choose where to send them.
              </Txt>
              <View style={{ gap: space.sm }}>
                <Button title="Share review summary" icon="text-box-outline" onPress={() => share('review')} disabled={busy} />
                <Button title="Share data as CSV" icon="table" kind="secondary" onPress={() => share('csv')} disabled={busy} />
              </View>
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}

function NotableList({ list, color }: { list: NotableDay[]; color: string }) {
  if (list.length === 0) {
    return <Card><Txt variant="caption">Rate a few more days in your reflections to see these.</Txt></Card>;
  }
  return (
    <Card padded={false} style={{ paddingHorizontal: space.lg }}>
      {list.map((n, i) => (
        <View key={n.day.date}>
          {i ? <Divider /> : null}
          <Row icon="calendar-blank-outline" color={color} title={fmtDate(n.day.date, 'dddd d MMM')} sub={n.why}
            onPress={() => router.push(`/day/${n.day.date}`)} />
        </View>
      ))}
    </Card>
  );
}
