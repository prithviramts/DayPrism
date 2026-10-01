import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TemplatePicker, TrackerEditor } from '../features/trackers-ui';
import { Tracker } from '../lib/domain';
import { deleteTracker, listTrackers, moveTracker, setArchived } from '../services/trackers';
import { useApp, useData } from '../ui/app-state';
import { Button, Card, Divider, Empty, Icon, IconBadge, IconButton, Loading, Section, Txt } from '../ui/kit';
import { contentColumn, space, useTheme } from '../ui/theme';

const KIND_LABEL = { check: 'Yes / no', count: 'Count', scale: 'Scale 1–5', measure: 'Measure' } as const;

/** Settings → Custom trackers: create, edit, reorder, archive and delete trackers. */
export default function TrackersScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { changed } = useApp();
  const { data: trackers } = useData(() => listTrackers(true), []);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<Tracker | 'new' | null>(null);

  const active = trackers?.filter((x) => !x.archived) ?? [];
  const archived = trackers?.filter((x) => x.archived) ?? [];

  const done = () => { setEditing(null); setPicking(false); changed(); };

  const remove = (tr: Tracker) => Alert.alert(`Delete ${tr.name}?`, 'This deletes the tracker and every entry logged for it. To keep the history, archive it instead.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Archive instead', onPress: async () => { await setArchived(tr.id, true); changed(); } },
    { text: 'Delete', style: 'destructive', onPress: async () => { await deleteTracker(tr.id); changed(); } },
  ]);

  const row = (tr: Tracker, i: number, list: Tracker[]) => (
    <View key={tr.id}>
      {i ? <Divider /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
        <IconBadge icon={tr.icon} color={t.tracker[tr.color] ?? t.accent} />
        <Pressable style={{ flex: 1 }} onPress={() => setEditing(tr)} accessibilityRole="button" accessibilityHint="Edit tracker">
          <Txt variant="bodyStrong">{tr.name}</Txt>
          <Txt variant="caption">
            {KIND_LABEL[tr.kind]}{tr.unit ? ` · ${tr.unit}` : ''}
            {tr.goal != null ? ` · goal ${tr.goalDirection === 'at_most' ? '≤' : '≥'} ${tr.goal}` : ''}
          </Txt>
        </Pressable>
        {tr.archived ? (
          <IconButton icon="archive-arrow-up-outline" label={`Restore ${tr.name}`} onPress={async () => { await setArchived(tr.id, false); changed(); }} />
        ) : (
          <>
            <IconButton icon="chevron-up" label={`Move ${tr.name} up`} color={i === 0 ? t.grid : undefined}
              onPress={async () => { if (i > 0) { await moveTracker(tr.id, -1); changed(); } }} />
            <IconButton icon="chevron-down" label={`Move ${tr.name} down`} color={i === list.length - 1 ? t.grid : undefined}
              onPress={async () => { if (i < list.length - 1) { await moveTracker(tr.id, 1); changed(); } }} />
          </>
        )}
        <IconButton icon="trash-can-outline" label={`Delete ${tr.name}`} color={t.danger} onPress={() => remove(tr)} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.sm }}>
        <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
        <Txt variant="heading" style={{ marginLeft: space.sm, flex: 1 }}>Your trackers</Txt>
      </View>
      <ScrollView contentContainerStyle={[{ padding: space.lg, paddingBottom: insets.bottom + space.xxl }, contentColumn]}>
        <Txt variant="body" color={t.text2} style={{ marginBottom: space.lg }}>
          Track anything that matters to you. DayPrism shows how each one goes along with your energy, sleep and day rating.
        </Txt>
        <Button title="Add a tracker" icon="plus" onPress={() => setPicking(true)} />

        {!trackers ? <Loading /> : active.length === 0 && archived.length === 0 ? (
          <Card style={{ marginTop: space.lg }}>
            <Empty icon="playlist-plus" title="No trackers yet" text="Start from a template like Alcohol, Medication or Stress, or create your own." />
          </Card>
        ) : null}

        {active.length ? (
          <Section title="Active" hint="shown on Today, in this order">
            <Card padded={false} style={{ paddingHorizontal: space.lg }}>{active.map((tr, i) => row(tr, i, active))}</Card>
          </Section>
        ) : null}

        {archived.length ? (
          <Section title="Archived" hint="hidden from Today; history kept">
            <Card padded={false} style={{ paddingHorizontal: space.lg }}>{archived.map((tr, i) => row(tr, i, archived))}</Card>
          </Section>
        ) : null}

        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xl, alignItems: 'center' }}>
          <Icon name="gesture-tap-hold" size={16} color={t.muted} />
          <Txt variant="caption" style={{ flex: 1 }}>On Today, tap a tracker to log it quickly; long-press to add a time or a note.</Txt>
        </View>
      </ScrollView>

      {picking ? (
        <TemplatePicker existing={(trackers ?? []).map((x) => x.name.toLowerCase())}
          onPicked={done} onCustom={() => { setPicking(false); setEditing('new'); }} onClose={() => setPicking(false)} />
      ) : null}
      {editing ? <TrackerEditor tracker={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={done} /> : null}
    </View>
  );
}
