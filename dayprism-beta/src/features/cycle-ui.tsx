import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { CYCLE_SYMPTOMS, CycleDay, FLOWS, Flow } from '../lib/domain';
import { DateOnly, addDays, daysBetween, fmtDate } from '../lib/time';
import * as repo from '../db/repo';
import { avg } from '../services/insights';
import { PHASE_LABEL, Phase, cycleDay, cycleDaysIn, phaseOf, saveCycleDay, summarise } from '../services/cycle';
import { useApp, useData } from '../ui/app-state';
import { Button, Card, Field, Icon, IconBadge, Input, Segmented, Txt, tap } from '../ui/kit';
import { Sheet } from '../ui/sheet';
import { alpha, radius, space, useTheme } from '../ui/theme';

const FLOW_LABEL: Record<Flow, string> = { spotting: 'Spotting', light: 'Light', medium: 'Medium', heavy: 'Heavy' };
const LOOKBACK_DAYS = 400;

/** Today: where you are in your cycle, and one tap to log. */
export function CycleCard({ date }: { date: DateOnly }) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const { changed } = useApp();
  const { data } = useData(async () => {
    const days = await cycleDaysIn(addDays(date, -LOOKBACK_DAYS), date);
    return { summary: summarise(days, date), todayLog: days.find((d) => d.date === date) ?? null };
  }, [date]);
  if (!data) return null;
  const { summary: s, todayLog } = data;
  const pink = t.tracker.pink;

  let headline: string;
  let sub: string;
  if (s.cycleDay == null) {
    headline = 'Start tracking your cycle';
    sub = 'Log the first day of your next period. DayPrism learns your rhythm from there.';
  } else {
    headline = s.onPeriod ? `Period · day ${s.cycleDay}` : `Cycle day ${s.cycleDay}`;
    if (s.nextStart) {
      const inDays = daysBetween(date, s.nextStart);
      sub = inDays > 0 ? `Next period in about ${inDays} day${inDays === 1 ? '' : 's'} (${fmtDate(s.nextStart, 'ddd d MMM')})`
        : inDays === 0 ? 'Your period may start today' : `Your period may be ${-inDays} day${inDays === -1 ? '' : 's'} late`;
    } else {
      sub = 'A prediction appears after one full cycle is logged.';
    }
  }

  return (
    <>
      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <IconBadge icon="water" color={pink} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">{headline}</Txt>
            <Txt variant="caption" style={{ fontSize: 13 }}>{sub}</Txt>
          </View>
        </View>
        {todayLog ? (
          <Txt variant="caption" color={t.text2}>
            Logged: {[todayLog.flow ? FLOW_LABEL[todayLog.flow] : null, ...todayLog.symptoms].filter(Boolean).join(' · ') || 'note'}
          </Txt>
        ) : null}
        <Button title={todayLog ? 'Edit today' : 'Log today'} compact kind="secondary" icon={todayLog ? 'pencil' : 'plus'} onPress={() => setEditing(true)} />
        {s.irregular ? <Txt variant="caption">Your recent cycles vary by more than a week, so predictions are rougher.</Txt> : null}
      </Card>
      {editing ? <CycleSheet date={date} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); changed(); }} /> : null}
    </>
  );
}

/** Log or edit one day: flow, symptoms and a note. */
export function CycleSheet({ date, onClose, onSaved }: { date: DateOnly; onClose: () => void; onSaved: () => void }) {
  const t = useTheme();
  const { data: existing } = useData(() => cycleDay(date), [date]);
  return existing === undefined ? null : <CycleForm key={existing?.id ?? 'new'} date={date} existing={existing} onClose={onClose} onSaved={onSaved} t={t} />;
}

function CycleForm({ date, existing, onClose, onSaved, t }: {
  date: DateOnly; existing: CycleDay | null; onClose: () => void; onSaved: () => void; t: ReturnType<typeof useTheme>;
}) {
  const [flow, setFlow] = useState<Flow | 'none'>(existing?.flow ?? 'none');
  const [symptoms, setSymptoms] = useState<string[]>(existing?.symptoms ?? []);
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const pink = t.tracker.pink;

  const toggle = (s: string) => { tap(); setSymptoms((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s])); };

  const save = async () => {
    setSaving(true);
    try {
      await saveCycleDay(date, flow === 'none' ? null : flow, symptoms, note);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible title={`Cycle · ${fmtDate(date, 'ddd d MMM')}`} onClose={onClose} onSave={save} saving={saving}
      saveLabel={existing ? 'Save changes' : 'Save'}
      onDelete={existing ? async () => { await saveCycleDay(date, null, [], null); onSaved(); } : undefined}>
      <Field label="Flow">
        <Segmented<Flow | 'none'> wrap value={flow} onChange={setFlow}
          options={[{ value: 'none', label: 'None' }, ...FLOWS.map((f) => ({ value: f, label: FLOW_LABEL[f] }))]} />
        <Txt variant="caption" style={{ marginTop: 6 }}>Spotting doesn&apos;t count as a period start.</Txt>
      </Field>
      <Field label="Symptoms" hint="optional">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {CYCLE_SYMPTOMS.map((s) => {
            const on = symptoms.includes(s);
            return (
              <Pressable key={s} onPress={() => toggle(s)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{
                  paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.pill,
                  backgroundColor: on ? pink : alpha(pink, 0.1), flexDirection: 'row', alignItems: 'center', gap: 4,
                }}>
                {on ? <Icon name="check" size={14} color="#ffffff" /> : null}
                <Txt variant="label" color={on ? '#ffffff' : t.text}>{s.charAt(0).toUpperCase() + s.slice(1)}</Txt>
              </Pressable>
            );
          })}
        </View>
      </Field>
      <Field label="Note" hint="optional">
        <Input value={note} onChangeText={setNote} maxLength={500} />
      </Field>
      <Txt variant="caption">Predictions are estimates from your own logs. They are not contraception or medical advice.</Txt>
    </Sheet>
  );
}

/** Insights: averages and how energy and mood differ by cycle phase. */
export function CycleInsightCard({ from, to }: { from: DateOnly; to: DateOnly }) {
  const t = useTheme();
  const { data } = useData(async () => {
    const days = await cycleDaysIn(addDays(to, -LOOKBACK_DAYS), to);
    const s = summarise(days, to);
    const checkIns = await repo.checkInsIn(`${from}T00:00:00`, `${addDays(to, 1)}T00:00:00`);
    const byPhase = new Map<Phase, { energy: number[]; mood: number[]; days: Set<string> }>();
    for (const c of checkIns) {
      const d = c.time.slice(0, 10);
      const ph = phaseOf(d, s.periods, s.avgCycle, s.avgPeriod);
      if (!ph) continue;
      const g = byPhase.get(ph) ?? { energy: [], mood: [], days: new Set() };
      g.energy.push(c.energy);
      g.mood.push(c.mood);
      g.days.add(d);
      byPhase.set(ph, g);
    }
    return { s, byPhase };
  }, [from, to]);
  if (!data) return null;
  const { s, byPhase } = data;
  const phases: Phase[] = ['period', 'follicular', 'luteal'];
  const enough = phases.filter((p) => (byPhase.get(p)?.days.size ?? 0) >= 2).length >= 2;

  return (
    <Card style={{ marginTop: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="water" size={18} color={t.tracker.pink} />
        <Txt variant="heading" style={{ flex: 1 }}>Your cycle</Txt>
      </View>
      <Txt variant="body" style={{ marginTop: space.sm, fontSize: 14, lineHeight: 20 }} color={s.cyclesCounted ? t.text : t.muted}>
        {s.cyclesCounted
          ? `Average cycle ${s.avgCycle} days, period about ${s.avgPeriod} days, from ${s.cyclesCounted} full cycle${s.cyclesCounted === 1 ? '' : 's'}.`
          : 'Log your periods for a full cycle to see your averages.'}
      </Txt>
      {enough ? (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          {phases.map((p) => {
            const g = byPhase.get(p);
            if (!g || g.days.size < 2) return null;
            return (
              <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Txt variant="label" style={{ width: 92 }}>{PHASE_LABEL[p]}</Txt>
                <Txt variant="caption" style={{ flex: 1 }}>
                  energy {avg(g.energy)!.toFixed(1)} · mood {avg(g.mood)!.toFixed(1)} · {g.days.size} days
                </Txt>
              </View>
            );
          })}
          <Txt variant="caption" style={{ marginTop: space.xs }}>Averages of your check-ins in each phase. Patterns, not diagnosis.</Txt>
        </View>
      ) : s.cyclesCounted ? (
        <Txt variant="caption" style={{ marginTop: space.sm }}>Check in through a full cycle to see how your energy and mood change by phase.</Txt>
      ) : null}
    </Card>
  );
}
