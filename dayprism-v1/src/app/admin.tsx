import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/session';
import { supabase } from '../auth/supabase';
import { countDemoRows, loadDemoData, removeDemoData } from '../services/demo';
import { useApp, useData } from '../ui/app-state';
import { GroupedBars } from '../ui/charts';
import { Button, Card, Divider, Empty, IconButton, Input, Loading, Row, Section, Txt } from '../ui/kit';
import { alpha, contentColumn, radius, space, useTheme } from '../ui/theme';

// The admin console. Admins see account metadata (who signed up, when, last active) and can
// disable accounts. They can never read anyone's entries: the server has no policy that allows
// it, so this screen couldn't show them even if it tried.

interface Stats {
  total_users: number; disabled_users: number; new_7d: number; new_30d: number;
  active_1d: number; active_7d: number; active_30d: number;
  signups_by_day: { day: string; count: number }[];
}

interface AdminUser {
  id: string; email: string; display_name: string | null; role: string; disabled: boolean; provider: string;
  created_at: string; last_seen_at: string | null; email_confirmed: boolean;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');

export default function AdminScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { isAdmin, changed } = useApp();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string>();
  const { data: demoRows } = useData(countDemoRows, []);

  const load = useCallback(async (q: string) => {
    setError(undefined);
    const [s, u] = await Promise.all([
      supabase.rpc('admin_stats'),
      supabase.rpc('admin_list_users', { p_search: q.trim() || null, p_limit: 100, p_offset: 0 }),
    ]);
    if (s.error || u.error) {
      setError((s.error ?? u.error)!.message);
      return;
    }
    setStats(s.data as Stats);
    setUsers(u.data as AdminUser[]);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { load(search).catch((e) => setError(String(e))); }, 300);
    return () => clearTimeout(timer);
  }, [search, load]);

  if (!isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top, justifyContent: 'center' }}>
        <Empty icon="shield-lock-outline" title="Admins only" action={<Button title="Go back" kind="secondary" onPress={() => router.back()} />} />
      </View>
    );
  }

  const toggleDisabled = (u: AdminUser) => {
    const verb = u.disabled ? 'Enable' : 'Disable';
    Alert.alert(`${verb} ${u.email}?`, u.disabled
      ? 'They will be able to sign in and sync again.'
      : 'They will be signed out of sync and can\'t read or save data until you enable the account again. Their data is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: verb, style: u.disabled ? 'default' : 'destructive',
        onPress: async () => {
          const { error: e } = await supabase.rpc('admin_set_disabled', { p_user: u.id, p_disabled: !u.disabled });
          if (e) Alert.alert('Could not update', e.message);
          await load(search);
        },
      },
    ]);
  };

  const demo = (action: 'load' | 'remove') => Alert.alert(
    action === 'load' ? 'Add demo data to your account?' : 'Remove demo data?',
    action === 'load'
      ? 'Three weeks of sample entries are added to your own account only (useful for screenshots and demos). Other users never see them.'
      : 'Only generated demo entries are removed. Anything you logged or edited yourself stays.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action === 'load' ? 'Add' : 'Remove', style: action === 'load' ? 'default' : 'destructive',
        onPress: async () => {
          await (action === 'load' ? loadDemoData() : removeDemoData());
          changed();
        },
      },
    ]);

  const tile = (label: string, value: number | string, sub?: string) => (
    <Card style={{ flexBasis: '47%', flexGrow: 1, padding: space.md }}>
      <Txt variant="caption">{label}</Txt>
      <Txt variant="number" style={{ marginTop: 2 }}>{value}</Txt>
      {sub ? <Txt variant="caption">{sub}</Txt> : null}
    </Card>
  );

  const recent = stats?.signups_by_day.slice(-14) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.sm }}>
        <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
        <Txt variant="heading" style={{ marginLeft: space.sm, flex: 1 }}>Admin console</Txt>
        <IconButton icon="refresh" label="Refresh" onPress={() => { load(search).catch(() => {}); }} />
      </View>

      <ScrollView contentContainerStyle={[{ padding: space.lg, paddingBottom: insets.bottom + space.xxl }, contentColumn]} keyboardShouldPersistTaps="handled">
        {error ? (
          <Card style={{ backgroundColor: t.dangerSoft }}>
            <Txt variant="bodyStrong" color={t.danger}>Couldn&apos;t load admin data</Txt>
            <Txt variant="caption" style={{ marginTop: 4 }}>{error}</Txt>
          </Card>
        ) : null}

        {!stats ? <Loading /> : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
              {tile('Total users', stats.total_users, `${stats.disabled_users} disabled`)}
              {tile('New this week', stats.new_7d, `${stats.new_30d} in 30 days`)}
              {tile('Active today', stats.active_1d)}
              {tile('Active this week', stats.active_7d, `${stats.active_30d} in 30 days`)}
            </View>

            <Section title="Sign-ups" hint="last 14 days">
              <Card>
                <GroupedBars
                  max={Math.max(1, ...recent.map((d) => d.count))}
                  format={(v) => String(Math.round(v))}
                  countLabel={() => ''}
                  series={[{ label: 'Sign-ups', color: t.accent }]}
                  groups={recent.map((d) => ({ label: d.day.slice(8), days: d.count, values: [d.count] }))}
                />
              </Card>
            </Section>
          </>
        )}

        <Section title="Users" hint={users ? `${users.length} shown` : undefined}>
          <Input value={search} onChangeText={setSearch} placeholder="Search by email or name" autoCapitalize="none" style={{ marginBottom: space.md }} />
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {!users ? <Loading /> : users.length === 0 ? <Empty icon="account-search-outline" title="No users found" /> : users.map((u, i) => (
              <View key={u.id}>
                {i ? <Divider /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: alpha(u.disabled ? t.muted : t.accent, 0.14), alignItems: 'center', justifyContent: 'center' }}>
                    <Txt variant="label" color={u.disabled ? t.muted : t.accent}>{(u.display_name || u.email)[0]?.toUpperCase()}</Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{u.display_name || u.email.split('@')[0]}</Txt>
                      {u.role === 'admin' ? <Badge text="ADMIN" color={t.tint.reflect} /> : null}
                      {u.disabled ? <Badge text="DISABLED" color={t.danger} /> : null}
                      {!u.email_confirmed ? <Badge text="UNVERIFIED" color={t.tint.caffeine} /> : null}
                    </View>
                    <Txt variant="caption" numberOfLines={1}>{u.email}{u.provider === 'google' ? ' · Google' : ''}</Txt>
                    <Txt variant="caption">Joined {fmt(u.created_at)} · last active {fmt(u.last_seen_at)}</Txt>
                  </View>
                  {u.id !== user?.id ? (
                    <IconButton icon={u.disabled ? 'account-check-outline' : 'account-cancel-outline'} label={u.disabled ? 'Enable account' : 'Disable account'}
                      color={u.disabled ? t.success : t.danger} onPress={() => toggleDisabled(u)} />
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        </Section>

        <Section title="Demo data" hint="your account only">
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {demoRows ? (
              <Row icon="flask-remove-outline" color={t.tint.caffeine} title="Remove demo data" sub={`${demoRows} demo entries in your account`} onPress={() => demo('remove')} />
            ) : (
              <Row icon="flask-outline" color={t.tint.caffeine} title="Add demo data" sub="Three weeks of sample entries, for screenshots and demos" onPress={() => demo('load')} />
            )}
          </Card>
        </Section>

        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xl, padding: space.md, borderRadius: radius.md, backgroundColor: t.surface2 }}>
          <Txt variant="caption" style={{ flex: 1 }}>
            Privacy by design: admins see account details only. Users&apos; entries are protected by row-level security and can&apos;t be read by anyone but their owner.
          </Txt>
        </View>
      </ScrollView>
    </View>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: alpha(color, 0.14) }}>
      <Txt variant="caption" color={color} style={{ fontSize: 10 }}>{text}</Txt>
    </View>
  );
}
