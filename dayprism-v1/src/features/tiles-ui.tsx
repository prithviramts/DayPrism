import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { caffeineName } from '../lib/domain';
import { hhmm, nowLocal } from '../lib/time';
import * as entries from '../services/entries';
import { lastCaffeine, lastMealOfType, mealTypeFor, newestId } from '../services/quick';
import { clearDay, logTracker } from '../services/trackers';
import { useApp } from '../ui/app-state';
import { Icon, IconBadge, IconButton, Ring, Txt, tap } from '../ui/kit';
import { Sheet } from '../ui/sheet';
import { useSnackbar } from '../ui/snackbar';
import { Theme, alpha, radius, space, useTheme } from '../ui/theme';
import { useEntrySheets } from './entry-sheets';
import { TileColor, TileData, TileDef, TileId, TileValue, packRows, resolveTiles, slotsUsed, tileValue } from './tiles';

export function tileColor(t: Theme, c: TileColor): string {
  const [group, key] = c.split('.') as ['tint' | 'tracker' | 'fam', string];
  return (t[group] as Record<string, string>)[key] ?? t.accent;
}

// ---------------------------------------------------------------- actions

/** What tapping (and long-pressing) each tile does. */
function useTileActions(data: TileData) {
  const { open } = useEntrySheets();
  const { changed, today } = useApp();
  const snackbar = useSnackbar();
  const { day } = data;

  const undo = (kind: Parameters<typeof entries.deleteEntry>[0], id: string | null) =>
    id ? { label: 'Undo', onPress: async () => { await entries.deleteEntry(kind, id); changed(); } } : undefined;

  const addWater = async () => {
    tap();
    await entries.saveWater(null, { time: nowLocal(), glasses: 1 });
    const id = await newestId('water_intakes');
    changed();
    snackbar.show({ message: `+1 glass of water · ${day.waterGlasses + 1} today`, action: undo('water', id) });
  };

  const repeatCaffeine = async () => {
    const last = await lastCaffeine();
    if (!last) { open({ kind: 'caffeine' }); return; }
    tap();
    await entries.saveCaffeine(null, { time: nowLocal(), type: last.type, servings: last.servings, caffeineMg: last.caffeineMg });
    const id = await newestId('caffeine_intakes');
    changed();
    snackbar.show({ message: `Logged ${caffeineName(last.type).toLowerCase()} · ${last.caffeineMg} mg`, action: undo('caffeine', id) });
  };

  const repeatMeal = async () => {
    const type = mealTypeFor(hhmm(nowLocal()));
    const last = await lastMealOfType(type, today);
    if (!last) { open({ kind: 'meal' }); return; }
    tap();
    await entries.saveMeal(null, { time: nowLocal(), mealType: type, description: last.description, size: last.size, skipped: false });
    const id = await newestId('meals');
    changed();
    snackbar.show({ message: `${type}: ${last.description}`, action: undo('meal', id) });
  };

  const tracker = async (id: string, long: boolean) => {
    const item = data.trackers.find((x) => x.tracker.id === id);
    if (!item) return;
    const { tracker: tr, value } = item;
    if (long || tr.kind === 'scale' || tr.kind === 'measure') { open({ kind: 'tracker', tracker: tr, date: today }); return; }
    tap();
    if (tr.kind === 'check') {
      if (value != null) await clearDay(tr.id, today);
      else await logTracker(tr, 1, nowLocal());
      changed();
      return;
    }
    await logTracker(tr, 1, nowLocal());
    changed();
    snackbar.show({ message: `${tr.name} +1` });
  };

  return (v: TileValue, long: boolean) => {
    const id = v.def.id;
    if (id.startsWith('tracker:')) return tracker(id.slice(8), long);
    switch (id) {
      case 'checkin': return open({ kind: 'checkin' });
      case 'sleep': return open(day.sleep ? { kind: 'sleep', entry: day.sleep } : { kind: 'sleep' });
      case 'water': return long ? open({ kind: 'water' }) : addWater();
      case 'meals': return long ? repeatMeal() : open({ kind: 'meal' });
      case 'caffeine': return long ? repeatCaffeine() : open({ kind: 'caffeine' });
      case 'activity': return open({ kind: 'activity' });
      case 'reflection': return open(day.reflection ? { kind: 'reflection', entry: day.reflection } : { kind: 'reflection' });
      case 'cycle': return open({ kind: 'cycle', date: today });
      case 'steps': return router.push('/settings');
    }
  };
}

const HINTS: Record<string, string> = {
  water: 'Tap to add a glass. Long-press to pick an amount.',
  meals: 'Long-press to repeat your usual meal for this time of day.',
  caffeine: 'Long-press to log your last drink again.',
};

// ---------------------------------------------------------------- grid

/** The tile grid: two columns on phones, four on tablets and wide windows. */
export function TileGrid({ tiles, data }: { tiles: TileDef[]; data: TileData }) {
  const { settings } = useApp();
  const act = useTileActions(data);
  const [width, setWidth] = useState(0);
  const columns = width >= 560 ? 4 : 2;
  const gap = space.md;
  const unit = width ? (width - gap * (columns - 1)) / columns : 0;
  const values = tiles.map((d) => tileValue(d, data, settings));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap }}>
      {unit > 0 ? packRows(values.map((v) => ({ ...v, span: v.def.span })), columns).map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap }}>
          {row.map((v) => {
            const span = Math.min(v.span, columns);
            return (
              <Tile key={v.def.id} v={v} width={unit * span + gap * (span - 1)}
                onPress={() => act(v, false)} onLongPress={() => act(v, true)} />
            );
          })}
        </View>
      )) : null}
    </View>
  );
}

function Tile({ v, width, onPress, onLongPress }: { v: TileValue; width: number; onPress: () => void; onLongPress: () => void }) {
  const t = useTheme();
  const color = tileColor(t, v.def.color);
  const wide = v.def.span === 2;
  const badge = v.progress != null
    ? <Ring progress={v.progress} color={color} icon={v.def.icon} size={40} over={v.over} />
    : <IconBadge icon={v.def.icon} color={color} size={40} />;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${v.def.name}: ${v.value}, ${v.sub}`}
      accessibilityHint={HINTS[v.def.id]}
      style={({ pressed }) => ({
        width, minHeight: 112, padding: space.md, borderRadius: radius.lg, backgroundColor: t.surface,
        borderWidth: 1, borderColor: v.over ? t.danger : v.done ? alpha(color, 0.55) : t.border,
        opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
        flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: space.md,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {badge}
        {v.done && !wide ? (
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={13} color="#ffffff" />
          </View>
        ) : null}
      </View>
      <View style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
        <Txt variant="caption" numberOfLines={1}>{v.def.name}</Txt>
        <Txt variant="number" numberOfLines={1} style={{ fontSize: 19 }} color={v.over ? t.danger : undefined}>{v.value}</Txt>
        <Txt variant="caption" numberOfLines={wide ? 2 : 1}>{v.sub}</Txt>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- editor

/** Choose, order and remove tiles within a slot budget (8 for Today, 4 for the widget). */
export function TileEditor({ title, intro, slots, defs, value, defaults, onSave, onClose }: {
  title: string; intro: string; slots: number; defs: TileDef[]; value: TileId[]; defaults: TileId[];
  onSave: (ids: TileId[]) => void | Promise<void>; onClose: () => void;
}) {
  const t = useTheme();
  const [ids, setIds] = useState(() => resolveTiles(value, defs, slots).map((d) => d.id));
  const used = slotsUsed(ids, defs);
  const chosen = ids.map((id) => defs.find((d) => d.id === id)!).filter(Boolean);
  const available = defs.filter((d) => !ids.includes(d.id));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    tap();
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    setIds(next);
  };
  const add = (d: TileDef) => {
    if (used + d.span > slots) {
      Alert.alert('No room', `${d.name} needs ${d.span} slot${d.span === 1 ? '' : 's'}. Remove a tile first.`);
      return;
    }
    tap();
    setIds([...ids, d.id]);
  };

  return (
    <Sheet visible title={title} onClose={onClose} saveLabel="Save" onSave={async () => { await onSave(ids); onClose(); }}>
      <Txt variant="caption" style={{ fontSize: 13, marginBottom: space.md }}>{intro}</Txt>

      {/* slot meter */}
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 6 }}>
        {Array.from({ length: slots }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < used ? t.accent : t.grid }} />
        ))}
      </View>
      <Txt variant="caption" style={{ marginBottom: space.lg }}>{used} of {slots} slots used</Txt>

      {chosen.length === 0 ? <Txt variant="caption" style={{ marginBottom: space.md }}>No tiles yet. Add some below.</Txt> : null}
      {chosen.map((d, i) => (
        <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6 }}>
          <IconBadge icon={d.icon} color={tileColor(t, d.color)} size={34} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>{d.name}</Txt>
            {d.span === 2 ? <Txt variant="caption">Uses 2 slots</Txt> : null}
          </View>
          <IconButton icon="chevron-up" label={`Move ${d.name} up`} onPress={() => move(i, -1)} color={i === 0 ? t.grid : undefined} />
          <IconButton icon="chevron-down" label={`Move ${d.name} down`} onPress={() => move(i, 1)} color={i === chosen.length - 1 ? t.grid : undefined} />
          <IconButton icon="minus-circle-outline" label={`Remove ${d.name}`} color={t.danger} onPress={() => { tap(); setIds(ids.filter((x) => x !== d.id)); }} />
        </View>
      ))}

      <Txt variant="label" style={{ marginTop: space.lg, marginBottom: space.sm }}>ADD A TILE</Txt>
      {available.map((d) => {
        const fits = used + d.span <= slots;
        return (
          <Pressable key={d.id} onPress={() => add(d)} accessibilityRole="button" accessibilityLabel={`Add ${d.name}`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, opacity: pressed ? 0.7 : fits ? 1 : 0.45 })}>
            <IconBadge icon={d.icon} color={tileColor(t, d.color)} size={34} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>{d.name}{d.span === 2 ? '  ·  2 slots' : ''}</Txt>
              <Txt variant="caption" numberOfLines={1}>{d.blurb}</Txt>
            </View>
            <Icon name="plus-circle" size={24} color={fits ? t.accent : t.muted} />
          </Pressable>
        );
      })}
      <Pressable onPress={() => { onClose(); router.push('/trackers'); }} accessibilityRole="link"
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md }}>
        <Icon name="playlist-plus" size={20} color={t.accent} />
        <Txt variant="label" color={t.accent}>Create your own tracker</Txt>
      </Pressable>
      <Pressable onPress={() => { tap(); setIds(resolveTiles(defaults, defs, slots).map((d) => d.id)); }} accessibilityRole="button"
        style={{ paddingVertical: space.sm, marginBottom: space.md }}>
        <Txt variant="label" color={t.muted}>Reset to default</Txt>
      </Pressable>
    </Sheet>
  );
}
