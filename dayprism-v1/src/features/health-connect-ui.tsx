import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { duration, showTime } from '../lib/time';
import { useApp, useData } from '../ui/app-state';
import { Button, Card, Divider, IconBadge, Row, Stepper, Txt } from '../ui/kit';
import { space, useTheme } from '../ui/theme';
import { useEntrySheets } from './entry-sheets';
import {
  HealthConnectStatus, connectHealthConnect, disconnectHealthConnect, healthConnectStatus, importFromHealthConnect,
  installHealthConnect, lastImportReport, openHealthConnectPermissions, suggestedSleep,
} from './health-connect';

/** "com.google.android.apps.fitness" → "Google Fit"; unknown packages show their last part. */
function appName(pkg: string): string {
  const known: Record<string, string> = {
    'com.google.android.apps.fitness': 'Google Fit',
    'com.google.android.apps.healthdata': 'Health Connect',
    'com.sec.android.app.shealth': 'Samsung Health',
    'com.fitbit.FitbitMobile': 'Fitbit',
    'com.garmin.android.apps.connectmobile': 'Garmin Connect',
    'com.ouraring.oura': 'Oura',
    'com.xiaomi.wearable': 'Mi Fitness',
    'com.huawei.health': 'Huawei Health',
  };
  if (known[pkg]) return known[pkg];
  const last = pkg.split('.').pop() ?? pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** On Today, when last night isn't logged yet but Health Connect has it: one tap to confirm and rate. */
export function SleepSuggestion() {
  const t = useTheme();
  const { today } = useApp();
  const { open } = useEntrySheets();
  const { data } = useData(() => suggestedSleep(today).catch(() => null), [today]);
  if (!data) return null;

  return (
    <Card style={{ marginTop: space.md, gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <IconBadge icon="weather-night" color={t.tint.sleep} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">Found last night&apos;s sleep</Txt>
          <Txt variant="caption" style={{ fontSize: 13 }}>
            {showTime(data.bed)} → {showTime(data.wake)} · {duration(data.hours)} · from Health Connect
          </Txt>
        </View>
      </View>
      <Button title="Confirm & rate" compact icon="check"
        onPress={() => open({ kind: 'sleep', date: today, prefill: { bed: data.bed, wake: data.wake } })} />
    </Card>
  );
}

/** Settings → Connected apps. */
export function HealthConnectCard() {
  const t = useTheme();
  const { settings, updateSettings, changed } = useApp();
  const [status, setStatus] = useState<HealthConnectStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => healthConnectStatus().then(setStatus);
  useEffect(() => { refresh(); }, []);

  const connect = async () => {
    setBusy(true);
    try {
      if (!(await connectHealthConnect())) {
        Alert.alert('Nothing was shared', 'DayPrism needs at least one permission (steps, workouts or sleep) to import. You can change this any time.');
        return;
      }
      const n = await importFromHealthConnect(true);
      changed();
      Alert.alert('Connected', n > 0 ? 'Your recent steps and workouts are in. DayPrism keeps them up to date.' : 'Connected. New steps and workouts will appear as they sync from your apps.');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const disconnect = () => Alert.alert('Stop importing?', 'Entries already imported stay in DayPrism. To remove the permissions too, use "Manage permissions".', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Stop', style: 'destructive', onPress: async () => { await disconnectHealthConnect(); refresh(); } },
  ]);

  const sync = async () => {
    setBusy(true);
    try {
      const n = await importFromHealthConnect(true);
      changed();
      const r = lastImportReport();
      const steps = r.todaySteps == null
        ? 'Steps aren\'t shared with DayPrism. Allow them under "Manage permissions".'
        : `Today: ${r.todaySteps.toLocaleString()} steps` + (r.stepSources.length ? ` from ${r.stepSources.map(appName).join(', ')}.` : '. No app has written steps to Health Connect today yet.');
      Alert.alert('Up to date', `${steps}\n\n${n > 0 ? `${n} new or updated entr${n === 1 ? 'y' : 'ies'}.` : 'Nothing else new since the last import.'}`);
    } finally {
      setBusy(false);
    }
  };

  const header = (sub: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
      <IconBadge icon="heart-pulse" color={t.fam.exercise} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">Health Connect</Txt>
        <Txt variant="caption">{sub}</Txt>
      </View>
    </View>
  );

  if (status === null) return <Card padded={false} style={{ paddingHorizontal: space.lg }}>{header('Checking…')}</Card>;

  return (
    <Card padded={false} style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
      {status === 'unavailable' ? (
        header('Not available on this phone.')
      ) : status === 'needs-install' ? (
        <>
          {header('Import steps, workouts and sleep from your watch and fitness apps.')}
          <Button title="Install Health Connect" icon="google-play" onPress={installHealthConnect} />
        </>
      ) : status === 'off' ? (
        <>
          {header('Import steps, workouts and sleep from Samsung Health, Google Fit, Fitbit, Garmin and more.')}
          <Button title={busy ? 'Connecting…' : 'Connect'} icon="link-variant" onPress={connect} disabled={busy} />
          <Txt variant="caption" style={{ marginTop: space.sm }}>DayPrism only reads. It never writes to Health Connect or shares this data.</Txt>
        </>
      ) : (
        <>
          {header('Connected. Steps and workouts import automatically; sleep is offered on Today for you to confirm.')}
          <Divider />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">Daily step goal</Txt>
              <Txt variant="caption">drawn as a ring on Today</Txt>
            </View>
            <Stepper value={settings.stepsTarget} min={1000} max={50000} step={1000}
              onChange={(v) => updateSettings({ stepsTarget: v })} format={(v) => `${(v / 1000).toFixed(0)}k`} />
          </View>
          <Divider />
          <Row icon="sync" title={busy ? 'Importing…' : 'Import now'} onPress={busy ? undefined : sync} />
          <Divider />
          <Row icon="shield-key-outline" title="Manage permissions" onPress={openHealthConnectPermissions} />
          <Divider />
          <Row icon="link-variant-off" danger title="Stop importing" onPress={disconnect} />
        </>
      )}
    </Card>
  );
}
