import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import {
  ACTIVITY_CATEGORIES, Activity, ActivityCategory, CAFFEINE_TYPES, CaffeineIntake, CaffeineType, DailyReflection,
  EnergyCheckIn, EntryKind, MEAL_SIZES, MEAL_TYPES, Meal, MealSize, MealType, SleepLog, Tracker, TrackerEntry, WaterIntake,
  activityIcon, activityName, caffeineIcon, caffeineName, familyOf, mealIcon, mgPerServing,
} from '../lib/domain';
import { DateOnly, addDays, combine, dateOf, duration, fmtDate, hhmm, nowLocal, today } from '../lib/time';
import * as entries from '../services/entries';
import { useApp, useData } from '../ui/app-state';
import { lastMealOfType, recentMeals, usualCaffeine } from '../services/quick';
import { CycleSheet } from './cycle-ui';
import { TrackerForm } from './trackers-ui';
import { Field, Icon, Input, RatingPicker, Segmented, Stepper, SwitchRow, TimeField, Txt, tap } from '../ui/kit';
import { Sheet } from '../ui/sheet';
import { alpha, radius, space, useTheme } from '../ui/theme';

// Add/edit forms for every kind of entry, opened from anywhere with useEntrySheets().open(...).
// `date` is the day being logged for: today by default, or a past day from History.

export type SheetRequest =
  | { kind: 'checkin'; date?: DateOnly; entry?: EnergyCheckIn }
  | { kind: 'meal'; date?: DateOnly; entry?: Meal }
  | { kind: 'caffeine'; date?: DateOnly; entry?: CaffeineIntake }
  | { kind: 'water'; date?: DateOnly; entry?: WaterIntake }
  | { kind: 'activity'; date?: DateOnly; entry?: Activity }
  | { kind: 'sleep'; date?: DateOnly; entry?: SleepLog; prefill?: { bed: string; wake: string } }
  | { kind: 'reflection'; date?: DateOnly; entry?: DailyReflection }
  | { kind: 'tracker'; tracker: Tracker; date?: DateOnly; entry?: TrackerEntry }
  | { kind: 'cycle'; date?: DateOnly };

const Ctx = createContext<{ open: (r: SheetRequest) => void } | null>(null);

export function useEntrySheets() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEntrySheets outside EntrySheetsProvider');
  return v;
}

export function EntrySheetsProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<SheetRequest | null>(null);
  // A fresh key per opening, so each form starts from its own initial values.
  const [key, setKey] = useState(0);
  const open = useCallback((r: SheetRequest) => { setReq(r); setKey((k) => k + 1); }, []);
  const close = useCallback(() => setReq(null), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {req ? <EntryForm key={key} req={req} onClose={close} /> : null}
    </Ctx.Provider>
  );
}

/** Default clock time for a new entry: now on today, midday on a past day. */
function defaultClock(date: DateOnly) {
  return date === today() ? hhmm(nowLocal()) : '12:00';
}

function EntryForm({ req, onClose }: { req: SheetRequest; onClose: () => void }) {
  const { changed } = useApp();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await action();
      changed();
      onClose();
    } catch (e) {
      if (e instanceof entries.ValidationError) setErrors(e.errors);
      else Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = (kind: EntryKind, id: string) => {
    Alert.alert('Delete this entry?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => entries.deleteEntry(kind, id)) },
    ]);
  };

  const common = { onClose, errors, saving, run, remove };
  switch (req.kind) {
    case 'cycle': return <CycleSheet date={req.date ?? today()} onClose={onClose} onSaved={() => { changed(); onClose(); }} />;
    case 'checkin': return <CheckInForm {...common} date={req.date} entry={req.entry} />;
    case 'meal': return <MealForm {...common} date={req.date} entry={req.entry} />;
    case 'caffeine': return <CaffeineForm {...common} date={req.date} entry={req.entry} />;
    case 'water': return <WaterForm {...common} date={req.date} entry={req.entry} />;
    case 'activity': return <ActivityForm {...common} date={req.date} entry={req.entry} />;
    case 'sleep': return <SleepForm {...common} date={req.date} entry={req.entry} prefill={req.prefill} />;
    case 'reflection': return <ReflectionForm {...common} date={req.date} entry={req.entry} />;
    case 'tracker':
      return <TrackerForm tracker={req.tracker} date={req.date} entry={req.entry} onClose={onClose}
        onSaved={() => { changed(); onClose(); }} onDelete={() => { changed(); onClose(); }} />;
  }
}

interface FormProps<T> {
  date?: DateOnly;
  entry?: T;
  onClose: () => void;
  errors: Record<string, string>;
  saving: boolean;
  run: (action: () => Promise<unknown>) => void;
  remove: (kind: EntryKind, id: string) => void;
}

/** "for Tue 29 Sep" when logging for a day other than today. */
const forDay = (d: DateOnly) => (d === today() ? '' : ` · ${fmtDate(d, 'ddd d MMM')}`);

// ---------------------------------------------------------------- check-in

function CheckInForm({ date, entry, onClose, errors, saving, run, remove }: FormProps<EnergyCheckIn>) {
  const day = entry ? dateOf(entry.time) : date ?? today();
  const [energy, setEnergy] = useState<number | null>(entry?.energy ?? null);
  const [sleepiness, setSleepiness] = useState<number | null>(entry?.sleepiness ?? null);
  const [mood, setMood] = useState<number | null>(entry?.mood ?? null);
  const [note, setNote] = useState(entry?.note ?? '');
  const [time, setTime] = useState(entry ? hhmm(entry.time) : defaultClock(day));

  return (
    <Sheet visible title={(entry ? 'Edit check-in' : 'How are you feeling?') + forDay(day)} onClose={onClose} saving={saving}
      saveLabel={entry ? 'Save changes' : 'Save check-in'}
      onDelete={entry ? () => remove('checkin', entry.id) : undefined}
      onSave={() => run(() => entries.saveCheckIn(entry?.id ?? null, {
        time: combine(day, time), energy: energy ?? 0, sleepiness: sleepiness ?? 0, mood: mood ?? 0, note,
      }))}>
      <RatingPicker label="Energy" low="Drained" high="Buzzing" value={energy} onChange={setEnergy} error={errors.energy} />
      <RatingPicker label="Sleepiness" low="Wide awake" high="Nodding off" value={sleepiness} onChange={setSleepiness} error={errors.sleepiness} />
      <RatingPicker label="Mood" low="Low" high="Great" value={mood} onChange={setMood} error={errors.mood} />
      <Field label="Note" hint="optional" error={errors.note}>
        <Input value={note} onChangeText={setNote} maxLength={1000} placeholder="e.g. after back-to-back calls" />
      </Field>
      <TimeField label="Time" value={time} onChange={setTime} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- meal

function suggestMealType(clock: string): MealType {
  const h = Number(clock.slice(0, 2));
  return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 18 ? 'Snack' : 'Dinner';
}

function MealForm({ date, entry, onClose, errors, saving, run, remove }: FormProps<Meal>) {
  const day = entry ? dateOf(entry.time) : date ?? today();
  const initialTime = entry ? hhmm(entry.time) : defaultClock(day);
  const [time, setTime] = useState(initialTime);
  const [mealType, setMealType] = useState<MealType>(entry?.mealType ?? suggestMealType(initialTime));
  const [skipped, setSkipped] = useState(entry?.skipped ?? false);
  const [description, setDescription] = useState(entry?.description ?? '');
  const [size, setSize] = useState<MealSize | null>(entry?.size ?? 'Normal');
  const { data: recent } = useData(() => (entry ? Promise.resolve([]) : recentMeals(day)), [day]);
  const { data: lastOfType } = useData(() => (entry ? Promise.resolve(null) : lastMealOfType(mealType, day)), [mealType, day]);
  const fill = (m: { mealType: MealType; description: string | null; size: MealSize | null }) => {
    tap();
    setMealType(m.mealType);
    setSkipped(false);
    setDescription(m.description ?? '');
    setSize(m.size ?? 'Normal');
  };

  return (
    <Sheet visible title={(entry ? 'Edit meal' : 'Meal') + forDay(day)} onClose={onClose} saving={saving}
      saveLabel={entry ? 'Save changes' : 'Save meal'}
      onDelete={entry ? () => remove('meal', entry.id) : undefined}
      onSave={() => run(() => entries.saveMeal(entry?.id ?? null, { time: combine(day, time), mealType, skipped, description, size }))}>
      <Field label="Meal">
        <Segmented options={MEAL_TYPES.map((m) => ({ value: m, label: m }))} value={mealType} onChange={setMealType} />
      </Field>
      {!entry && (lastOfType || (recent && recent.length > 0)) ? (
        <QuickChips label="Quick fill">
          {lastOfType ? (
            <Chip highlight icon="history"
              text={`Same as ${dateOf(lastOfType.time) === addDays(day, -1) ? 'yesterday' : fmtDate(dateOf(lastOfType.time), 'ddd')}: ${lastOfType.description}`}
              onPress={() => fill(lastOfType)} />
          ) : null}
          {(recent ?? []).filter((r) => r.description !== lastOfType?.description).map((r) => (
            <Chip key={`${r.mealType}-${r.description}`} icon={mealIcon(r.mealType)} text={r.description} onPress={() => fill(r)} />
          ))}
        </QuickChips>
      ) : null}
      <SwitchRow label="I skipped this meal" sub="Logging a skip helps spot patterns" value={skipped} onChange={setSkipped} />
      {!skipped ? (
        <>
          <Field label="What did you eat?" error={errors.description}>
            <Input value={description} onChangeText={setDescription} maxLength={1000} placeholder="e.g. Chicken salad" invalid={!!errors.description} />
          </Field>
          <Field label="Size" error={errors.size}>
            <Segmented options={MEAL_SIZES.map((s) => ({ value: s, label: s }))} value={size} onChange={setSize} />
          </Field>
        </>
      ) : null}
      <TimeField label="Time" value={time} onChange={setTime} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- caffeine

function CaffeineForm({ date, entry, onClose, errors, saving, run, remove }: FormProps<CaffeineIntake>) {
  const t = useTheme();
  const day = entry ? dateOf(entry.time) : date ?? today();
  const [type, setType] = useState<CaffeineType>(entry?.type ?? 'Coffee');
  const [servings, setServings] = useState(entry?.servings ?? 1);
  // Null = estimate from type × servings; set only when the user overrides it.
  const [mg, setMg] = useState<string>(entry && entry.caffeineMg !== Math.round(mgPerServing(entry.type) * entry.servings) ? String(entry.caffeineMg) : '');
  const [time, setTime] = useState(entry ? hhmm(entry.time) : defaultClock(day));
  const estimate = Math.round(mgPerServing(type) * servings);
  const { data: usual } = useData(() => (entry ? Promise.resolve([]) : usualCaffeine(day)), [day]);

  return (
    <Sheet visible title={(entry ? 'Edit caffeine' : 'Caffeine') + forDay(day)} onClose={onClose} saving={saving}
      saveLabel={entry ? 'Save changes' : 'Save caffeine'}
      onDelete={entry ? () => remove('caffeine', entry.id) : undefined}
      onSave={() => run(() => entries.saveCaffeine(entry?.id ?? null, {
        time: combine(day, time), type, servings, caffeineMg: mg.trim() ? Number(mg) : null,
      }))}>
      {usual && usual.length > 0 ? (
        <QuickChips label="Your usual">
          {usual.map((u) => (
            <Chip key={`${u.type}-${u.servings}-${u.caffeineMg}`} icon={caffeineIcon(u.type)}
              text={`${caffeineName(u.type)}${u.servings !== 1 ? ` ×${u.servings}` : ''} · ${u.caffeineMg} mg`}
              highlight={type === u.type && servings === u.servings}
              onPress={() => { tap(); setType(u.type); setServings(u.servings); setMg(u.custom ? String(u.caffeineMg) : ''); }} />
          ))}
        </QuickChips>
      ) : null}
      <Field label="Type">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {CAFFEINE_TYPES.map((c) => {
            const on = c === type;
            return (
              <Pressable key={c} onPress={() => { tap(); setType(c); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={{
                  width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md,
                  borderRadius: radius.md, backgroundColor: on ? alpha(t.tint.caffeine, 0.14) : t.surface2,
                  borderWidth: 1.5, borderColor: on ? t.tint.caffeine : 'transparent',
                }}>
                <Icon name={caffeineIcon(c)} size={20} color={on ? t.tint.caffeine : t.text2} />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" style={{ fontSize: 14 }}>{caffeineName(c)}</Txt>
                  <Txt variant="caption">~{mgPerServing(c)} mg</Txt>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Field>
      <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' }}>
        <Field label="Servings" error={errors.servings}>
          <Stepper value={servings} onChange={setServings} min={0.5} max={10} step={0.5} />
        </Field>
        <Field label="Caffeine (mg)" hint="optional" error={errors.caffeineMg} style={{ flex: 1 }}>
          <Input value={mg} onChangeText={(v) => setMg(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder={`${estimate} (estimate)`} maxLength={4} />
        </Field>
      </View>
      <TimeField label="Time" value={time} onChange={setTime} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- water

function WaterForm({ date, entry, onClose, errors, saving, run, remove }: FormProps<WaterIntake>) {
  const day = entry ? dateOf(entry.time) : date ?? today();
  const [glasses, setGlasses] = useState(entry?.glasses ?? 1);
  const [time, setTime] = useState(entry ? hhmm(entry.time) : defaultClock(day));
  return (
    <Sheet visible title={(entry ? 'Edit water' : 'Water') + forDay(day)} onClose={onClose} saving={saving}
      saveLabel={entry ? 'Save changes' : 'Save water'}
      onDelete={entry ? () => remove('water', entry.id) : undefined}
      onSave={() => run(() => entries.saveWater(entry?.id ?? null, { time: combine(day, time), glasses }))}>
      <Field label="Glasses" error={errors.glasses}>
        <Stepper value={glasses} onChange={setGlasses} min={1} max={10} />
      </Field>
      <TimeField label="Time" value={time} onChange={setTime} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- activity

function ActivityForm({ date, entry, onClose, errors, saving, run, remove }: FormProps<Activity>) {
  const t = useTheme();
  const day = entry ? dateOf(entry.startTime) : date ?? today();
  const isToday = day === today();
  const [category, setCategory] = useState<ActivityCategory | null>(entry?.category ?? null);
  const [start, setStart] = useState(entry ? hhmm(entry.startTime) : defaultClock(day));
  // Past days can't have a running activity, so they always log a finished one.
  const [finished, setFinished] = useState(entry ? entry.endTime != null : !isToday);
  const [end, setEnd] = useState(entry?.endTime ? hhmm(entry.endTime) : isToday ? hhmm(nowLocal()) : '13:00');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [pickError, setPickError] = useState<string>();

  const save = () => {
    if (!category) { setPickError('Pick what you are doing.'); return; }
    const startTime = combine(day, start);
    // An end earlier than the start on the clock means it ran past midnight.
    const endTime = finished ? combine(end <= start ? addDays(day, 1) : day, end) : null;
    const req = { startTime, endTime, category, notes };
    run(() => (entry ? entries.updateActivity(entry.id, req) : entries.startActivity(req)));
  };

  return (
    <Sheet visible title={(entry ? 'Edit activity' : 'Activity') + forDay(day)} onClose={onClose} saving={saving}
      saveLabel={entry ? 'Save changes' : finished ? 'Save activity' : 'Start timer'}
      onDelete={entry ? () => remove('activity', entry.id) : undefined}
      onSave={save}>
      <Field label="What are you doing?" error={pickError}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {ACTIVITY_CATEGORIES.map((c) => {
            const on = c === category;
            const color = t.fam[familyOf(c)];
            return (
              <Pressable key={c} onPress={() => { tap(); setCategory(c); setPickError(undefined); }}
                accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={{
                  width: '31%', flexGrow: 1, alignItems: 'center', gap: 4, paddingVertical: space.md, paddingHorizontal: 4,
                  borderRadius: radius.md, backgroundColor: on ? alpha(color, 0.16) : t.surface2,
                  borderWidth: 1.5, borderColor: on ? color : 'transparent',
                }}>
                <Icon name={activityIcon(c)} size={20} color={on ? color : t.text2} />
                <Txt variant="caption" color={on ? t.text : t.text2} numberOfLines={1} style={{ fontSize: 12 }}>{activityName(c)}</Txt>
              </Pressable>
            );
          })}
        </View>
      </Field>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <TimeField label="Started" value={start} onChange={setStart} error={errors.startTime} />
        {finished ? <TimeField label="Ended" value={end} onChange={setEnd} error={errors.endTime} /> : null}
      </View>
      {isToday ? (
        <SwitchRow label="Already finished" sub={finished ? 'An end earlier than the start counts as the next day' : 'Runs as a timer until you stop it'}
          value={finished} onChange={setFinished} />
      ) : null}
      {!finished && errors.endTime ? <Txt variant="caption" color={t.danger}>{errors.endTime}</Txt> : null}
      <Field label="Notes" hint="optional" error={errors.notes} style={{ marginTop: space.sm }}>
        <Input value={notes} onChangeText={setNotes} maxLength={1000} />
      </Field>
      {!entry && !finished ? <Txt variant="caption">Starting a new activity stops the one that&apos;s running.</Txt> : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------- sleep

function SleepForm({ date, entry, onClose, errors, saving, run, remove, prefill }: FormProps<SleepLog> & { prefill?: { bed: string; wake: string } }) {
  const t = useTheme();
  const wakeDate = entry ? dateOf(entry.wakeTime) : date ?? today();
  const [bed, setBed] = useState(entry ? hhmm(entry.bedTime) : prefill ? hhmm(prefill.bed) : '23:00');
  const [wake, setWake] = useState(entry ? hhmm(entry.wakeTime) : prefill ? hhmm(prefill.wake) : '07:00');
  const [quality, setQuality] = useState<number | null>(entry?.quality ?? null);
  const [woken, setWoken] = useState(entry?.timesWoken ?? 0);
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const { hours } = entries.sleepTimes({ wakeDate, bedTime: bed, wakeTime: wake });

  return (
    <Sheet visible title={(entry ? 'Edit sleep' : 'Last night') + forDay(wakeDate)} onClose={onClose} saving={saving}
      saveLabel={entry ? 'Save changes' : 'Save sleep'}
      onDelete={entry ? () => remove('sleep', entry.id) : undefined}
      onSave={() => run(() => entries.upsertSleep({ wakeDate, bedTime: bed, wakeTime: wake, quality: quality ?? 0, timesWoken: woken, notes }))}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <TimeField label="Went to bed" value={bed} onChange={setBed} error={errors.bedTime} />
        <TimeField label="Woke up" value={wake} onChange={setWake} error={errors.wakeTime} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: -space.sm, marginBottom: space.lg }}>
        <Icon name="weather-night" size={16} color={t.tint.sleep} />
        <Txt variant="label">{hours > 0 ? `${duration(hours)} of sleep` : 'Check the times'}</Txt>
      </View>
      <RatingPicker label="Quality" low="Terrible" high="Great" value={quality} onChange={setQuality} error={errors.quality} />
      <Field label="Times woken up" error={errors.timesWoken}>
        <Stepper value={woken} onChange={setWoken} min={0} max={30} />
      </Field>
      <Field label="Notes" hint="optional" error={errors.notes}>
        <Input value={notes} onChangeText={setNotes} maxLength={2000} />
      </Field>
    </Sheet>
  );
}

// ---------------------------------------------------------------- reflection

function ReflectionForm({ date, entry, onClose, errors, saving, run, remove }: FormProps<DailyReflection>) {
  const day = entry?.date ?? date ?? today();
  const [wentWell, setWentWell] = useState(entry?.wentWell ?? '');
  const [didnt, setDidnt] = useState(entry?.didntGoWell ?? '');
  const [differently, setDifferently] = useState(entry?.doDifferently ?? '');
  const [rating, setRating] = useState<number | null>(entry?.dayRating ?? null);

  return (
    <Sheet visible title={(entry ? 'Edit reflection' : 'Reflect on your day') + forDay(day)} onClose={onClose} saving={saving}
      saveLabel={entry ? 'Save changes' : 'Save reflection'}
      onDelete={entry ? () => remove('reflection', entry.id) : undefined}
      onSave={() => run(() => entries.upsertReflection({ date: day, wentWell, didntGoWell: didnt, doDifferently: differently, dayRating: rating ?? 0 }))}>
      <Field label="What went well?" error={errors.wentWell}>
        <Input value={wentWell} onChangeText={setWentWell} multiline numberOfLines={2} maxLength={2000} style={{ minHeight: 70 }} />
      </Field>
      <Field label="What didn't?" error={errors.didntGoWell}>
        <Input value={didnt} onChangeText={setDidnt} multiline numberOfLines={2} maxLength={2000} style={{ minHeight: 70 }} />
      </Field>
      <Field label="One thing to do differently tomorrow" error={errors.doDifferently}>
        <Input value={differently} onChangeText={setDifferently} multiline numberOfLines={2} maxLength={2000} style={{ minHeight: 70 }} />
      </Field>
      <RatingPicker label="Overall day" low="Bad" high="Great" value={rating} onChange={setRating} error={errors.dayRating} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- quick-fill chips

function QuickChips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Field label={label}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }}>
        {children}
      </ScrollView>
    </Field>
  );
}

function Chip({ text, icon, onPress, highlight }: { text: string; icon: string; onPress: () => void; highlight?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Fill in: ${text}`}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 260, paddingHorizontal: space.md, paddingVertical: 8,
        borderRadius: radius.pill, backgroundColor: highlight ? t.accentSoft : t.surface2,
        borderWidth: 1, borderColor: highlight ? t.accent : 'transparent', opacity: pressed ? 0.7 : 1,
      })}>
      <Icon name={icon} size={15} color={highlight ? t.accent : t.text2} />
      <Txt variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{text}</Txt>
    </Pressable>
  );
}
