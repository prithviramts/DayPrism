import * as Application from 'expo-application';
import { router } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { Alert, View } from 'react-native';

import { requestPinWidget } from 'react-native-android-widget';

import { useAuth } from '../../auth/session';
import { supabase } from '../../auth/supabase';
import { AuthField, PasswordStrength, friendlyAuthError, passwordProblem } from '../../features/auth-ui';
import { authenticate, canUseAppLock, setAppLockEnabled, useAppLockEnabled } from '../../features/lock';
import { HealthConnectCard } from '../../features/health-connect-ui';
import { ReminderSettingsCard } from '../../features/reminder-settings';
import { FLAME } from '../../features/streak-ui';
import { DEFAULT_WIDGET_TILES, WIDGET_SLOTS, catalog } from '../../features/tiles';
import { TileEditor } from '../../features/tiles-ui';
import { TileId } from '../../features/tile-grid';
import { trackersForDay } from '../../services/trackers';
import { ThemePreference } from '../../lib/domain';
import { showTime, timeZoneName } from '../../lib/time';
import { shareCsv } from '../../services/export';
import { getSyncStatus, subscribeSyncStatus, syncNow } from '../../sync/engine';
import { STREAK_WIDGET, TODAY_WIDGET, refreshWidgets } from '../../widget/task-handler';
import { loadWidgetTiles, saveWidgetTiles } from '../../widget/snapshot';
import { useApp, useData } from '../../ui/app-state';
import { Card, Divider, Field, Input, Row, Screen, Section, Segmented, Stepper, SwitchRow, Txt } from '../../ui/kit';
import { Sheet } from '../../ui/sheet';
import { alpha, radius, space, useTheme } from '../../ui/theme';

export default function SettingsScreen() {
  const t = useTheme();
  const { settings, updateSettings, isAdmin } = useApp();
  const { user, signOut, deleteAccount } = useAuth();
  const lock = useAppLockEnabled();
  const sync = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  const [name, setName] = useState(settings.displayName ?? '');
  const [changingPassword, setChangingPassword] = useState(false);
  const [editingWidget, setEditingWidget] = useState(false);

  const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';
  const display = settings.displayName || user?.email?.split('@')[0] || 'You';
  const initials = display.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const pinWidget = async (widgetName: string) => {
    const ok = await requestPinWidget({ widgetName }).catch(() => false);
    if (!ok) Alert.alert('Add it from your home screen', 'Long-press an empty spot on your home screen, tap Widgets, then find DayPrism.');
  };

  const toggleLock = async (on: boolean) => {
    if (on && !(await canUseAppLock())) {
      Alert.alert('Set up a screen lock first', 'App lock uses your phone\'s fingerprint, face unlock or PIN. Add one in your phone\'s settings, then try again.');
      return;
    }
    // Confirm it's really you before turning protection on or off.
    if (await authenticate(on ? 'Turn on app lock' : 'Turn off app lock')) await setAppLockEnabled(on);
  };

  const confirmSignOut = () => Alert.alert('Sign out?', 'Your entries stay safely in your account. Sign in again any time to see them.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Sign out', style: 'destructive',
      onPress: () => signOut().catch((e) => Alert.alert('Not signed out', e instanceof Error ? e.message : String(e))),
    },
  ]);

  const confirmDelete = () => Alert.alert(
    'Delete your account?',
    'This permanently deletes your account and every entry, on this phone and on our servers. It can\'t be undone. Export your data first if you want a copy.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => Alert.alert('Are you sure?', 'Your account and all of your data will be deleted now.', [
          { text: 'Keep my account', style: 'cancel' },
          {
            text: 'Delete forever', style: 'destructive',
            onPress: () => deleteAccount().catch((e) => Alert.alert('Could not delete the account', friendlyAuthError(e))),
          },
        ]),
      },
    ]);

  const syncLine = (() => {
    if (sync.state === 'syncing') return { icon: 'cloud-sync-outline', color: t.accent, title: 'Syncing…', sub: 'Saving your latest changes' };
    if (sync.state === 'offline') {
      return { icon: 'cloud-off-outline', color: t.tint.caffeine, title: 'Offline', sub: sync.pending ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} will upload when you're back online` : 'Everything is saved on this phone' };
    }
    if (sync.state === 'error') return { icon: 'cloud-alert', color: t.danger, title: 'Sync paused', sub: 'Tap to try again. Your entries are safe on this phone.' };
    const when = sync.lastSyncedAt ? showTime(`${String(new Date(sync.lastSyncedAt).getHours()).padStart(2, '0')}:${String(new Date(sync.lastSyncedAt).getMinutes()).padStart(2, '0')}`) : null;
    return { icon: 'cloud-check-outline', color: t.success, title: 'All changes saved', sub: when ? `Last synced at ${when}` : 'Your entries are backed up to your account' };
  })();

  const card = (children: React.ReactNode) => <Card padded={false} style={{ paddingHorizontal: space.lg }}>{children}</Card>;

  return (
    <Screen title="Settings">
      {/* ---- Account card */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: alpha(t.accent, 0.16), alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="heading" color={t.accent}>{initials}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Txt variant="heading" numberOfLines={1} style={{ flexShrink: 1 }}>{display}</Txt>
            {isAdmin ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: alpha(t.tint.reflect, 0.16) }}>
                <Txt variant="caption" color={t.tint.reflect} style={{ fontSize: 11 }}>ADMIN</Txt>
              </View>
            ) : null}
          </View>
          <Txt variant="caption" numberOfLines={1}>{user?.email}{provider === 'google' ? ' · Google' : ''}</Txt>
        </View>
      </Card>

      <Section title="Profile">
        <Card>
          <Field label="Name" hint="used in your greeting" style={{ marginBottom: 0 }}>
            <Input value={name} onChangeText={setName} maxLength={40} placeholder="Your first name" autoCapitalize="words"
              onEndEditing={() => updateSettings({ displayName: name.trim() || null })} returnKeyType="done" />
          </Field>
        </Card>
      </Section>

      <Section title="Appearance">
        <Segmented<ThemePreference>
          options={[{ value: 'System', label: 'System', icon: 'theme-light-dark' }, { value: 'Light', label: 'Light', icon: 'white-balance-sunny' }, { value: 'Dark', label: 'Dark', icon: 'weather-night' }]}
          value={settings.theme} onChange={(theme) => updateSettings({ theme })} />
      </Section>

      <Section title="Daily goals" hint="drawn as rings on Today">
        {card(
          <>
            <GoalRow label="Sleep" sub="hours per night">
              <Stepper value={settings.sleepTargetHours} min={4} max={12} step={0.5} onChange={(v) => updateSettings({ sleepTargetHours: v })} format={(v) => `${v}h`} />
            </GoalRow>
            <Divider />
            <GoalRow label="Water" sub="glasses per day">
              <Stepper value={settings.waterTargetGlasses} min={1} max={20} onChange={(v) => updateSettings({ waterTargetGlasses: v })} />
            </GoalRow>
            <Divider />
            <GoalRow label="Meals" sub="per day">
              <Stepper value={settings.mealsTarget} min={1} max={6} onChange={(v) => updateSettings({ mealsTarget: v })} />
            </GoalRow>
            <Divider />
            <GoalRow label="Caffeine limit" sub="mg per day; the ring turns red past it">
              <Stepper value={settings.caffeineLimitMg} min={50} max={1000} step={50} onChange={(v) => updateSettings({ caffeineLimitMg: v })} />
            </GoalRow>
          </>,
        )}
      </Section>

      <Section title="Tracking">
        {card(
          <>
            <Row icon="calendar-week" title="Your week" sub="Streak, averages and goals compared with last week" onPress={() => router.push('/week')} />
            <Divider />
            <Row icon="playlist-plus" title="Your trackers" sub="Alcohol, meds, stress, weight or anything you like" onPress={() => router.push('/trackers')} />
            <Divider />
            <SwitchRow icon="water" label="Cycle tracking"
              sub="Log periods and symptoms, see your cycle day and an estimated next period. Private like everything else."
              value={settings.cycleTracking} onChange={(v) => updateSettings({ cycleTracking: v })} />
          </>,
        )}
      </Section>

      <Section title="Connected apps">
        <HealthConnectCard />
      </Section>

      <Section title="Reminders">
        <ReminderSettingsCard />
      </Section>

      <Section title="Home screen widgets">
        {card(
          <>
            <Row icon="view-grid-outline" title="Today widget tiles" sub="Choose up to 4 slots. Each tile is a one-tap shortcut."
              onPress={() => setEditingWidget(true)} />
            <Divider />
            <Row icon="widgets-outline" title="Add the Today widget" sub="Your chosen tiles, right on your home screen."
              onPress={() => pinWidget(TODAY_WIDGET)} />
            <Divider />
            <Row icon="fire" color={FLAME} title="Add the Streak widget" sub="Your day streak and the last 7 days. Lights up once today is logged."
              onPress={() => pinWidget(STREAK_WIDGET)} />
          </>,
        )}
      </Section>

      <Section title="Backup & sync">
        {card(
          <Row icon={syncLine.icon} color={syncLine.color} title={syncLine.title} sub={syncLine.sub}
            onPress={() => { syncNow().catch(() => {}); }} />,
        )}
      </Section>

      <Section title="Privacy & security">
        {card(
          <>
            <SwitchRow icon="fingerprint" label="App lock" sub="Fingerprint, face or phone PIN to open DayPrism on this phone. Also hides it in recent apps."
              value={lock} onChange={toggleLock} />
            <Divider />
            <Row icon="shield-lock-outline" color={t.success} title="Your data is protected"
              sub="Encrypted on this phone (AES-256) and in transit (TLS). Only you can access your entries." />
            <Divider />
            <Row icon="file-document-outline" title="Privacy policy" onPress={() => router.push('/privacy')} />
            <Divider />
            <Row icon="scale-balance" title="Terms of service" onPress={() => router.push('/terms')} />
          </>,
        )}
      </Section>

      <Section title="Your data">
        {card(
          <Row icon="export-variant" title="Export all data" sub="Every entry as a CSV spreadsheet"
            onPress={() => shareCsv().catch((e) => Alert.alert('Could not export', String(e)))} />,
        )}
      </Section>

      {isAdmin ? (
        <Section title="Administration">
          {card(
            <Row icon="shield-crown-outline" color={t.tint.reflect} title="Admin console" sub="Users, growth and demo data" onPress={() => router.push('/admin')} />,
          )}
        </Section>
      ) : null}

      <Section title="Account">
        {card(
          <>
            {provider === 'email' ? (
              <>
                <Row icon="lock-reset" title="Change password" onPress={() => setChangingPassword(true)} />
                <Divider />
              </>
            ) : null}
            <Row icon="logout" title="Sign out" onPress={confirmSignOut} />
            <Divider />
            <Row icon="account-remove-outline" danger title="Delete account" sub="Permanently delete your account and all data" onPress={confirmDelete} />
          </>,
        )}
      </Section>

      <View style={{ alignItems: 'center', marginTop: space.xxl, gap: 4 }}>
        <Txt variant="caption">DayPrism {Application.nativeApplicationVersion ?? ''} ({Application.nativeBuildVersion ?? 'dev'})</Txt>
        <Txt variant="caption">Times follow your phone&apos;s time zone ({timeZoneName()})</Txt>
      </View>

      {changingPassword ? <ChangePasswordSheet onClose={() => setChangingPassword(false)} /> : null}
      {editingWidget ? <WidgetTilesSheet onClose={() => setEditingWidget(false)} /> : null}
    </Screen>
  );
}

/** Picks the Today widget's tiles (stored on this phone: a widget belongs to its home screen). */
function WidgetTilesSheet({ onClose }: { onClose: () => void }) {
  const { settings, today, changed } = useApp();
  const { data } = useData(async () => ({ trackers: await trackersForDay(today), ids: await loadWidgetTiles() }), [today]);
  if (!data) return null;
  return (
    <TileEditor
      title="Today widget"
      intro="Pick what your home-screen widget shows. Four slots; the cycle tile takes two. Tapping a tile logs or opens it."
      slots={WIDGET_SLOTS}
      defs={catalog(settings, data.trackers)}
      value={data.ids}
      defaults={DEFAULT_WIDGET_TILES}
      onSave={async (ids: TileId[]) => { await saveWidgetTiles(ids); changed(); await refreshWidgets(); }}
      onClose={onClose}
    />
  );
}

function GoalRow({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, gap: space.md }}>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{label}</Txt>
        <Txt variant="caption">{sub}</Txt>
      </View>
      {children}
    </View>
  );
}

function ChangePasswordSheet({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const problem = passwordProblem(password);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (e) throw e;
      onClose();
      Alert.alert('Password changed', 'Use your new password next time you sign in.');
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible title="Change password" onClose={onClose} onSave={save} saveLabel={busy ? 'Saving…' : 'Save password'} saving={busy}>
      <AuthField label="New password" icon="lock-outline" value={password} onChangeText={setPassword} error={error}
        placeholder="At least 8 characters" secure autoComplete="new-password" autoFocus />
      <PasswordStrength password={password} />
    </Sheet>
  );
}
