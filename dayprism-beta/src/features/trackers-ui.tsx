import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  TRACKER_COLORS, TRACKER_ICONS, TRACKER_TEMPLATES, Tracker, TrackerEntry, TrackerKind, TrackerTemplate,
} from '../lib/domain';
import { DateOnly, combine, dateOf, hhmm, nowLocal, today } from '../lib/time';
import { ValidationError } from '../services/entries';
import {
  TrackerInput, TrackerToday, addFromTemplate, clearDay, deleteTrackerEntry, formatValue, logTracker, metGoal,
  saveTracker, trackersForDay, updateTrackerEntry,
} from '../services/trackers';
import { useApp, useData } from '../ui/app-state';
import { Field, Icon, IconBadge, Input, RatingPicker, Segmented, Stepper, TimeField, Txt, tap } from '../ui/kit';
import { Sheet } from '../ui/sheet';
import { alpha, radius, space, useTheme } from '../ui/theme';
import { useEntrySheets } from './entry-sheets';

// ---------------------------------------------------------------- Today row

/** "Your trackers" on Today (or a past day): one tile per tracker, tapping does the obvious thing. */
export function TrackersRow({ date }: { date: DateOnly }) {
  const t = useTheme();
  const { changed } = useApp();
  const { open } = useEntrySheets();
  const { data } = useData(() => trackersForDay(date), [date]);
  if (!data) return null;

  if (data.length === 0) {
    return (
      <Pressable onPress={() => router.push('/trackers')} accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg,
          borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.grid, opacity: pressed ? 0.7 : 1,
        })}>
        <IconBadge icon="playlist-plus" color={t.accent} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">Track anything</Txt>
          <Txt variant="caption">Alcohol, meds, stress, weight, reading… and see how they shape your days.</Txt>
        </View>
        <Icon name="chevron-right" size={20} color={t.muted} />
      </Pressable>
    );
  }

  const time = date === today() ? nowLocal() : combine(date, '12:00');

  const quick = async (item: TrackerToday) => {
    const { tracker } = item;
    tap();
    if (tracker.kind === 'check') {
      if (item.value != null) await clearDay(tracker.id, date);
      else await logTracker(tracker, 1, time);
      changed();
    } else if (tracker.kind === 'count') {
      await logTracker(tracker, 1, time);
      changed();
    } else {
      open({ kind: 'tracker', tracker, date });
    }
  };

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {data.map((item) => {
        const { tracker, value } = item;
        const color = t.tracker[tracker.color] ?? t.accent;
        const done = tracker.kind === 'check' ? value != null : metGoal(tracker, value) === true;
        const over = tracker.goalDirection === 'at_most' && metGoal(tracker, value) === false;
        return (
          <Pressable
            key={tracker.id}
            onPress={() => quick(item)}
            onLongPress={() => open({ kind: 'tracker', tracker, date })}
            accessibilityRole="button"
            accessibilityLabel={`${tracker.name}, ${formatValue(tracker, value)}. ${tracker.kind === 'count' ? 'Tap to add one.' : tracker.kind === 'check' ? 'Tap to toggle.' : 'Tap to log.'} Long-press for more.`}
            style={({ pressed }) => ({
              flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md,
              borderRadius: radius.lg, backgroundColor: t.surface, borderWidth: 1,
              borderColor: over ? t.danger : done ? alpha(color, 0.6) : t.border, opacity: pressed ? 0.8 : 1,
            })}
          >
            <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? color : alpha(color, 0.14) }}>
              <Icon name={done && tracker.kind === 'check' ? 'check' : tracker.icon} size={19} color={done ? '#ffffff' : color} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong" style={{ fontSize: 14 }} numberOfLines={1}>{tracker.name}</Txt>
              <Txt variant="caption" numberOfLines={1} color={over ? t.danger : undefined}>
                {formatValue(tracker, value)}
                {tracker.goal != null && tracker.kind !== 'check' ? ` · goal ${tracker.goalDirection === 'at_most' ? '≤' : '≥'} ${tracker.goal}` : ''}
              </Txt>
            </View>
            {tracker.kind === 'count' ? <Icon name="plus" size={18} color={t.muted} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- log / edit one entry

export function TrackerForm({ tracker, date, entry, onClose, onSaved, onDelete }: {
  tracker: Tracker; date?: DateOnly; entry?: TrackerEntry; onClose: () => void; onSaved: () => void; onDelete?: () => void;
}) {
  const t = useTheme();
  const day = entry ? dateOf(entry.time) : date ?? today();
  const [value, setValue] = useState<number | null>(entry?.value ?? (tracker.kind === 'count' ? 1 : tracker.kind === 'check' ? 1 : null));
  const [text, setText] = useState(entry && tracker.kind === 'measure' ? String(entry.value) : '');
  const [time, setTime] = useState(entry ? hhmm(entry.time) : day === today() ? hhmm(nowLocal()) : '12:00');
  const [note, setNote] = useState(entry?.note ?? '');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const color = t.tracker[tracker.color] ?? t.accent;

  const save = async () => {
    const v = tracker.kind === 'measure' ? Number(text.replace(',', '.')) : value;
    if (v == null || Number.isNaN(v) || (tracker.kind === 'measure' && !text.trim())) {
      setError(tracker.kind === 'scale' ? 'Pick a value from 1 to 5.' : 'Enter a value.');
      return;
    }
    setSaving(true);
    try {
      if (entry) await updateTrackerEntry(entry.id, v, combine(day, time), note);
      else await logTracker(tracker, v, combine(day, time), note);
      onSaved();
    } catch (e) {
      setError(e instanceof ValidationError ? Object.values(e.errors)[0] : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible title={entry ? `Edit ${tracker.name.toLowerCase()}` : tracker.name} onClose={onClose} saving={saving}
      saveLabel={entry ? 'Save changes' : 'Log it'} onSave={save}
      onDelete={entry ? async () => { await deleteTrackerEntry(entry.id); onDelete?.(); } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg }}>
        <IconBadge icon={tracker.icon} color={color} size={44} />
        <Txt variant="caption" style={{ flex: 1, fontSize: 13 }}>
          {tracker.kind === 'check' ? 'Marks the day as done.' : tracker.kind === 'count' ? `How many${tracker.unit ? ` ${tracker.unit}` : ''}?` : tracker.kind === 'scale' ? '1 is the lowest, 5 the highest.' : `Your reading${tracker.unit ? ` in ${tracker.unit}` : ''}.`}
        </Txt>
      </View>
      {tracker.kind === 'count' ? (
        <Field label={tracker.unit ? `Amount (${tracker.unit})` : 'Amount'} error={error}>
          <Stepper value={value ?? 1} onChange={setValue} min={0} max={999} step={1} />
        </Field>
      ) : null}
      {tracker.kind === 'scale' ? (
        <RatingPicker label="Level" low="Low" high="High" value={value} onChange={setValue} error={error} />
      ) : null}
      {tracker.kind === 'measure' ? (
        <Field label={tracker.unit ? `Value (${tracker.unit})` : 'Value'} error={error}>
          <Input value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder="e.g. 72.4" autoFocus={!entry} maxLength={10} />
        </Field>
      ) : null}
      <TimeField label="Time" value={time} onChange={setTime} />
      <Field label="Note" hint="optional">
        <Input value={note} onChangeText={setNote} maxLength={500} />
      </Field>
    </Sheet>
  );
}

// ---------------------------------------------------------------- create / edit a tracker

const KINDS: { value: TrackerKind; label: string; icon: string; hint: string }[] = [
  { value: 'check', label: 'Yes / no', icon: 'check-circle-outline', hint: 'Did it happen today?' },
  { value: 'count', label: 'Count', icon: 'plus-circle-outline', hint: 'Tap +1 each time' },
  { value: 'scale', label: 'Scale 1–5', icon: 'gauge', hint: 'How strong was it?' },
  { value: 'measure', label: 'Measure', icon: 'ruler', hint: 'A number with a unit' },
];

export function TrackerEditor({ tracker, onClose, onSaved }: { tracker?: Tracker; onClose: () => void; onSaved: () => void }) {
  const t = useTheme();
  const [name, setName] = useState(tracker?.name ?? '');
  const [kind, setKind] = useState<TrackerKind>(tracker?.kind ?? 'check');
  const [unit, setUnit] = useState(tracker?.unit ?? '');
  const [icon, setIcon] = useState(tracker?.icon ?? 'sprout-outline');
  const [color, setColor] = useState(tracker?.color ?? 'blue');
  const [hasGoal, setHasGoal] = useState(tracker?.goal != null);
  const [goal, setGoal] = useState(tracker?.goal ?? 1);
  const [direction, setDirection] = useState<'at_least' | 'at_most'>(tracker?.goalDirection ?? 'at_least');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const amount = kind === 'count' || kind === 'measure';

  const save = async () => {
    const input: TrackerInput = {
      name, kind, unit: unit || null, icon, color,
      goal: amount && hasGoal ? goal : null, goalDirection: amount && hasGoal ? direction : null,
    };
    setSaving(true);
    try {
      await saveTracker(tracker?.id ?? null, input);
      onSaved();
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.errors);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible title={tracker ? 'Edit tracker' : 'New tracker'} onClose={onClose} onSave={save} saving={saving}
      saveLabel={tracker ? 'Save changes' : 'Create tracker'}>
      <Field label="Name" error={errors.name}>
        <Input value={name} onChangeText={setName} maxLength={40} placeholder="e.g. Vitamins" invalid={!!errors.name} autoFocus={!tracker} />
      </Field>

      <Field label="Type" hint={tracker ? "can't change once created" : undefined}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {KINDS.map((k) => {
            const on = k.value === kind;
            return (
              <Pressable key={k.value} disabled={!!tracker} onPress={() => { tap(); setKind(k.value); }}
                accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !!tracker }}
                style={{
                  width: '48%', flexGrow: 1, padding: space.md, borderRadius: radius.md, gap: 2,
                  backgroundColor: on ? t.accentSoft : t.surface2, borderWidth: 1.5, borderColor: on ? t.accent : 'transparent',
                  opacity: tracker && !on ? 0.4 : 1,
                }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Icon name={k.icon} size={18} color={on ? t.accent : t.text2} />
                  <Txt variant="bodyStrong" style={{ fontSize: 14 }}>{k.label}</Txt>
                </View>
                <Txt variant="caption">{k.hint}</Txt>
              </Pressable>
            );
          })}
        </View>
      </Field>

      {amount ? (
        <>
          <Field label="Unit" hint="optional" error={errors.unit}>
            <Input value={unit} onChangeText={setUnit} maxLength={16} placeholder={kind === 'count' ? 'e.g. glasses, pages' : 'e.g. kg, mmol/L'} />
          </Field>
          <Field label="Daily goal" hint="optional">
            <Segmented
              options={[{ value: 'none', label: 'No goal' }, { value: 'at_least', label: 'At least' }, { value: 'at_most', label: 'At most' }]}
              value={hasGoal ? direction : 'none'}
              onChange={(v) => { if (v === 'none') setHasGoal(false); else { setHasGoal(true); setDirection(v as 'at_least' | 'at_most'); } }}
            />
            {hasGoal ? (
              <View style={{ marginTop: space.md }}>
                <Stepper value={goal} onChange={setGoal} min={0} max={10000} step={kind === 'measure' ? 0.5 : 1} />
              </View>
            ) : null}
          </Field>
        </>
      ) : null}

      <Field label="Colour">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {TRACKER_COLORS.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} accessibilityRole="radio" accessibilityLabel={c} accessibilityState={{ selected: c === color }}
              style={{
                width: 36, height: 36, borderRadius: 18, backgroundColor: t.tracker[c], alignItems: 'center', justifyContent: 'center',
                borderWidth: 3, borderColor: c === color ? t.text : 'transparent',
              }}>
              {c === color ? <Icon name="check" size={18} color="#ffffff" /> : null}
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="Icon">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {TRACKER_ICONS.map((i) => {
            const on = i === icon;
            const c = t.tracker[color];
            return (
              <Pressable key={i} onPress={() => setIcon(i)} accessibilityRole="radio" accessibilityLabel={i.replace(/-/g, ' ')} accessibilityState={{ selected: on }}
                style={{
                  width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: on ? c : alpha(c, 0.12),
                }}>
                <Icon name={i} size={22} color={on ? '#ffffff' : c} />
              </Pressable>
            );
          })}
        </View>
      </Field>
    </Sheet>
  );
}

/** Template gallery shown when adding a tracker. */
export function TemplatePicker({ existing, onPicked, onCustom, onClose }: {
  existing: string[]; onPicked: () => void; onCustom: () => void; onClose: () => void;
}) {
  const t = useTheme();
  const add = async (tpl: TrackerTemplate) => {
    await addFromTemplate(tpl);
    onPicked();
  };
  return (
    <Sheet visible title="Add a tracker" onClose={onClose}>
      <Pressable onPress={onCustom} accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, marginBottom: space.lg,
          backgroundColor: t.accentSoft, opacity: pressed ? 0.8 : 1,
        })}>
        <IconBadge icon="pencil-plus-outline" color={t.accent} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">Create your own</Txt>
          <Txt variant="caption">Any name, type, unit, icon and colour</Txt>
        </View>
        <Icon name="chevron-right" size={20} color={t.muted} />
      </Pressable>
      <Txt variant="label" style={{ marginBottom: space.sm }}>Or start from a template</Txt>
      <ScrollView>
        {TRACKER_TEMPLATES.map((tpl) => {
          const taken = existing.includes(tpl.name.toLowerCase());
          const c = t.tracker[tpl.color];
          return (
            <Pressable key={tpl.name} disabled={taken} onPress={() => add(tpl)} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, opacity: taken ? 0.4 : pressed ? 0.7 : 1 })}>
              <IconBadge icon={tpl.icon} color={c} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{tpl.name}</Txt>
                <Txt variant="caption">{taken ? 'Already added' : tpl.hint}</Txt>
              </View>
              {!taken ? <Icon name="plus" size={20} color={t.accent} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}
