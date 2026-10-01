import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { isEnabled } from '../lib/channel';
import { Food, NUTRIENT_INFO, Nutrient, Nutrients, foodById, scale, sum } from '../lib/nutrition/foods';
import { UNIT_LABEL, parseMeal, search, toGrams } from '../lib/nutrition/parse';
import { nowLocal, showTime } from '../lib/time';
import { deleteFoodLogs, foodsOn, frequentFoods, logFoods } from '../services/nutrition';
import { useApp, useData } from '../ui/app-state';
import { Button, Card, Divider, Empty, Icon, IconButton, Input, Page, Ring, Section, Txt, tap } from '../ui/kit';
import { useSnackbar } from '../ui/snackbar';
import { alpha, radius, space, useTheme } from '../ui/theme';

// Nutrition (DayPrism Beta): type what you ate with amounts, check the matches, log it.
// Everything is computed on the phone from the offline food table; nothing is sent anywhere
// except your own encrypted, synced diary.

interface Draft { key: string; text: string; food: Food | null; matches: Food[]; grams: string; picking: boolean; query: string }

const MACROS: Nutrient[] = ['protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat'];
const MICROS: Nutrient[] = ['sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'vitA', 'vitC', 'vitD', 'vitB12', 'folate'];

const fmt = (v: number, unit: string) => `${v >= 100 || unit === 'kcal' ? Math.round(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1)} ${unit}`;

export default function NutritionScreen() {
  const t = useTheme();
  const { today, changed } = useApp();
  const snackbar = useSnackbar();
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data } = useData(async () => ({ logs: await foodsOn(today), frequent: await frequentFoods() }), [today]);

  if (!isEnabled('nutrition')) {
    return <Page title="Nutrition"><Empty icon="food-apple-outline" title="Coming soon" text="Nutrition tracking is being tested in DayPrism Beta." /></Page>;
  }

  const calculate = () => {
    tap();
    setDrafts(parseMeal(text).map((p, i) => ({
      key: `${Date.now()}-${i}`, text: p.text, food: p.food, matches: p.matches, query: p.query, picking: !p.food,
      grams: p.grams != null ? String(Math.round(p.grams)) : '',
    })));
  };

  const update = (key: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const grams = (d: Draft) => Number(d.grams.replace(',', '.'));
  const ready = drafts.filter((d) => d.food && grams(d) > 0);
  const mealTotal = sum(ready.map((d) => scale(d.food!.per100g, grams(d))));

  const save = async () => {
    if (!ready.length) return;
    setSaving(true);
    try {
      const ids = await logFoods(ready.map((d) => ({ foodId: d.food!.id, name: d.food!.name, grams: grams(d), per100g: d.food!.per100g })), nowLocal());
      changed();
      setDrafts([]);
      setText('');
      snackbar.show({
        message: `Logged ${ids.length} food${ids.length === 1 ? '' : 's'} · ${Math.round(mealTotal.kcal)} kcal`,
        action: { label: 'Undo', onPress: async () => { await deleteFoodLogs(ids); changed(); } },
      });
    } finally {
      setSaving(false);
    }
  };

  const logs = data?.logs ?? [];
  const dayTotal = sum(logs.map((l) => l.nutrients));

  return (
    <Page title="Nutrition" right={
      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: alpha(t.tracker.violet, 0.14), marginRight: space.sm }}>
        <Txt variant="label" color={t.tracker.violet}>BETA</Txt>
      </View>
    }>
      {/* today */}
      <Card style={{ gap: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Ring progress={dayTotal.kcal / 2000} color={t.tracker.green} icon="fire" size={72} />
          <View style={{ flex: 1 }}>
            <Txt variant="caption">Today</Txt>
            <Txt variant="display">{Math.round(dayTotal.kcal)}<Txt variant="caption"> kcal</Txt></Txt>
            <Txt variant="caption">{logs.length ? `${logs.length} item${logs.length === 1 ? '' : 's'} logged` : 'Nothing logged yet'}</Txt>
          </View>
        </View>
        <MacroBars n={dayTotal} />
      </Card>

      {/* input */}
      <Section title="What did you eat?">
        <Card style={{ gap: space.md }}>
          <Input value={text} onChangeText={setText} multiline placeholder="e.g. 100g dal rice, 50g fries, 200ml watermelon juice"
            style={{ minHeight: 72, textAlignVertical: 'top' }} accessibilityLabel="Foods and amounts" />
          <Txt variant="caption">Use grams or ml for accuracy. &quot;2 roti&quot;, &quot;1 bowl dal&quot; or &quot;a glass of milk&quot; work too.</Txt>
          {data?.frequent.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {data.frequent.map((f) => (
                <Pressable key={f.foodId} accessibilityRole="button" accessibilityLabel={`Add ${f.name}`}
                  onPress={() => { tap(); setText((x) => `${x.trim() ? `${x.trim().replace(/,$/, '')}, ` : ''}${Math.round(f.grams)}g ${foodById(f.foodId)?.aliases[0] ?? f.name}`); }}
                  style={({ pressed }) => ({ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: t.surface2, opacity: pressed ? 0.7 : 1 })}>
                  <Txt variant="label">+ {foodById(f.foodId)?.name ?? f.name}</Txt>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Button title="Calculate" icon="calculator-variant-outline" onPress={calculate} disabled={!text.trim()} />
        </Card>
      </Section>

      {/* review */}
      {drafts.length ? (
        <Section title="Check and log" hint="tap a food to change it">
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {drafts.map((d, i) => (
              <View key={d.key}>
                {i > 0 ? <Divider /> : null}
                <DraftRow d={d} onChange={(p) => update(d.key, p)} onRemove={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} />
              </View>
            ))}
          </Card>
          {ready.length ? (
            <Card style={{ marginTop: space.md, gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Txt variant="bodyStrong">This meal</Txt>
                <Txt variant="number">{Math.round(mealTotal.kcal)}<Txt variant="caption"> kcal</Txt></Txt>
              </View>
              <MacroBars n={mealTotal} />
              <NutrientTable n={mealTotal} keys={MICROS} />
              <Button title={`Log ${ready.length} food${ready.length === 1 ? '' : 's'}`} icon="check" onPress={save} disabled={saving} />
            </Card>
          ) : null}
        </Section>
      ) : null}

      {/* today's log */}
      {logs.length ? (
        <Section title="Eaten today">
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {logs.map((l, i) => (
              <View key={l.id}>
                {i > 0 ? <Divider /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong" numberOfLines={1}>{l.name}</Txt>
                    <Txt variant="caption">{showTime(l.time)} · {Math.round(l.grams)} g · P {l.nutrients.protein.toFixed(1)} · C {l.nutrients.carbs.toFixed(1)} · F {l.nutrients.fat.toFixed(1)}</Txt>
                  </View>
                  <Txt variant="bodyStrong">{Math.round(l.nutrients.kcal)}</Txt>
                  <IconButton icon="trash-can-outline" label={`Delete ${l.name}`} color={t.muted} onPress={async () => {
                    await deleteFoodLogs([l.id]);
                    changed();
                    snackbar.show({ message: `Removed ${l.name}` });
                  }} />
                </View>
              </View>
            ))}
          </Card>
          <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.md }}>
            <Txt variant="label" color={t.accent}>{showAll ? 'Hide' : 'Show'} vitamins & minerals today</Txt>
            <Icon name={showAll ? 'chevron-up' : 'chevron-down'} size={18} color={t.accent} />
          </Pressable>
          {showAll ? <Card><NutrientTable n={dayTotal} keys={MICROS} /></Card> : null}
        </Section>
      ) : null}

      <Txt variant="caption" style={{ marginTop: space.xl, fontSize: 12 }}>
        Estimates based on USDA FoodData Central and Indian Food Composition Tables (IFCT 2017) values, with home dishes
        computed from typical recipes. Real dishes vary, especially in oil and salt. Daily values (%) are for adults on a
        2,000 kcal reference diet. This is not medical or dietary advice: for children, pregnancy or medical diets, ask a
        doctor or dietitian.
      </Txt>
    </Page>
  );
}

function DraftRow({ d, onChange, onRemove }: { d: Draft; onChange: (p: Partial<Draft>) => void; onRemove: () => void }) {
  const t = useTheme();
  const g = Number(d.grams.replace(',', '.'));
  const results = d.picking ? (d.query.trim() ? search(d.query, 6) : d.matches) : [];
  const choose = (f: Food) => {
    tap();
    const parsed = parseMeal(d.text)[0];
    const converted = parsed ? toGrams(f, parsed.quantity, parsed.unit) : null;
    onChange({ food: f, picking: false, grams: d.grams || (converted != null ? String(Math.round(converted)) : '') });
  };

  return (
    <View style={{ paddingVertical: space.md, gap: space.sm }}>
      <Txt variant="caption" numberOfLines={1}>&quot;{d.text}&quot;</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable style={{ flex: 1 }} onPress={() => onChange({ picking: !d.picking })} accessibilityRole="button"
          accessibilityLabel={d.food ? `${d.food.name}, tap to change` : 'No match, tap to search'}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Txt variant="bodyStrong" color={d.food ? undefined : t.danger} numberOfLines={2} style={{ flexShrink: 1 }}>
              {d.food ? d.food.name : 'No match. Search below'}
            </Txt>
            <Icon name="swap-horizontal" size={16} color={t.accent} />
          </View>
          {d.food?.recipe ? <Txt variant="caption" style={{ fontSize: 11 }}>typical home recipe</Txt> : null}
        </Pressable>
        <View style={{ width: 92, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Input value={d.grams} onChangeText={(v) => onChange({ grams: v.replace(/[^0-9.,]/g, '') })} keyboardType="decimal-pad"
            style={{ flex: 1, textAlign: 'right', paddingHorizontal: 8 }} accessibilityLabel="Grams" invalid={!d.grams || !(g > 0)} />
          <Txt variant="caption">g</Txt>
        </View>
        <IconButton icon="close" label="Remove" onPress={onRemove} color={t.muted} />
      </View>
      {d.food && g > 0 ? (
        <Txt variant="caption">
          {Math.round(scale(d.food.per100g, g).kcal)} kcal · {Math.round(d.food.per100g.kcal)} kcal per 100 g
          {d.food.piece ? ` · 1 ${UNIT_LABEL.piece} ≈ ${d.food.piece} g` : d.food.bowl ? ` · 1 bowl ≈ ${d.food.bowl} g` : ''}
        </Txt>
      ) : !d.grams && d.food ? <Txt variant="caption" color={t.danger}>Enter the amount in grams.</Txt> : null}
      {d.picking ? (
        <View style={{ gap: space.sm }}>
          <Input value={d.query} onChangeText={(q) => onChange({ query: q })} placeholder="Search foods" accessibilityLabel="Search foods" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {results.map((f) => (
              <Pressable key={f.id} onPress={() => choose(f)} accessibilityRole="button"
                style={({ pressed }) => ({
                  paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, opacity: pressed ? 0.7 : 1,
                  backgroundColor: f.id === d.food?.id ? t.accent : t.surface2,
                })}>
                <Txt variant="label" color={f.id === d.food?.id ? t.accentInk : undefined}>{f.name}</Txt>
              </Pressable>
            ))}
            {results.length === 0 ? <Txt variant="caption">No foods match. Try a simpler name, like &quot;rice&quot; or &quot;dal&quot;.</Txt> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Protein, carbs, fat… as bars towards the daily value. */
function MacroBars({ n }: { n: Nutrients }) {
  const t = useTheme();
  const colors: Partial<Record<Nutrient, string>> = {
    protein: t.tracker.violet, carbs: t.tracker.amber, fat: t.tracker.orange, fiber: t.tracker.green, sugar: t.tracker.pink, satFat: t.tracker.red,
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {MACROS.map((k) => {
        const info = NUTRIENT_INFO[k];
        const pct = info.dv ? n[k] / info.dv : null;
        return (
          <View key={k} style={{ flexBasis: '30%', flexGrow: 1, gap: 4 }}>
            <Txt variant="caption" numberOfLines={1}>{info.label}</Txt>
            <Txt variant="bodyStrong">{fmt(n[k], info.unit)}</Txt>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: alpha(colors[k] ?? t.accent, 0.16), overflow: 'hidden' }}>
              {pct != null ? <View style={{ width: `${Math.min(100, pct * 100)}%`, height: 5, backgroundColor: colors[k] ?? t.accent }} /> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Vitamins and minerals with % of the adult daily value. */
function NutrientTable({ n, keys }: { n: Nutrients; keys: Nutrient[] }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {keys.map((k) => {
        const info = NUTRIENT_INFO[k];
        const pct = info.dv ? Math.round((n[k] / info.dv) * 100) : null;
        const high = k === 'sodium' && pct != null && pct >= 100;
        return (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Txt variant="caption" style={{ width: 96 }} numberOfLines={1}>{info.label}</Txt>
            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: t.grid, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, pct ?? 0)}%`, height: 6, backgroundColor: high ? t.danger : t.accent }} />
            </View>
            <Txt variant="caption" style={{ width: 64, textAlign: 'right' }}>{fmt(n[k], info.unit)}</Txt>
            <Txt variant="label" style={{ width: 40, textAlign: 'right' }} color={high ? t.danger : undefined}>{pct != null ? `${pct}%` : ''}</Txt>
          </View>
        );
      })}
    </View>
  );
}
