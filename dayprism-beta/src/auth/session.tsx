import type { Session, User } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { eraseUserDatabase, getDb, openUserDatabase } from '../db/database';
import { pendingChanges, startSync, stopSync, syncNow } from '../sync/engine';
import { cancelAllReminders } from '../features/reminders';
import { clearWidgetSnapshot } from '../widget/snapshot';
import { refreshWidgets } from '../widget/task-handler';
import { signOutOfGoogle } from './google';
import { supabase } from './supabase';

// Who is signed in, and getting their on-phone database ready.
//
//   loading    reading the saved session at launch
//   signedOut  show the welcome / sign-in screens
//   ready      session valid and the user's encrypted database is open
//   error      signed in, but the on-phone database couldn't be opened

export interface Profile { role: 'user' | 'admin'; disabled: boolean }

type Status = 'loading' | 'signedOut' | 'ready' | 'error';

interface AuthValue {
  status: Status;
  user: User | null;
  profile: Profile;
  error: string | null;
  /** Bumped when synced data arrived from the server, so screens reload. */
  remoteRevision: number;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  retry: () => void;
}

/** After sign-out, nothing about the user stays visible: reminders stop, the widget is emptied. */
async function clearDeviceTraces() {
  await cancelAllReminders();
  await clearWidgetSnapshot();
  await refreshWidgets();
}

const DEFAULT_PROFILE: Profile = { role: 'user', disabled: false };
const Ctx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** Reads the profile from the server, falling back to the copy cached on this phone when offline. */
async function loadProfile(userId: string): Promise<Profile> {
  const db = getDb();
  const { data, error } = await supabase.from('profiles').select('role, disabled').eq('id', userId).maybeSingle();
  if (!error && data) {
    await db.runAsync("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('profile', ?)", JSON.stringify(data));
    return { role: data.role === 'admin' ? 'admin' : 'user', disabled: !!data.disabled };
  }
  const cached = await db.getFirstAsync<{ value: string }>("SELECT value FROM sync_state WHERE key = 'profile'");
  return cached ? { ...DEFAULT_PROFILE, ...JSON.parse(cached.value) } : DEFAULT_PROFILE;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [error, setError] = useState<string | null>(null);
  const [remoteRevision, setRemoteRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const preparedFor = useRef<string | null>(null);

  // Session: the saved one at launch, then every sign-in / sign-out / token refresh.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setStatus('signedOut');
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setStatus('signedOut');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // When a user is signed in, open their database, load their profile and start syncing.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      preparedFor.current = null;
      stopSync();
      return;
    }
    if (preparedFor.current === userId && attempt === 0) return;
    let live = true;
    (async () => {
      try {
        await openUserDatabase(userId);
        const p = await loadProfile(userId);
        if (!live) return;
        preparedFor.current = userId;
        setProfile(p);
        setError(null);
        setStatus('ready');
        startSync(userId, () => setRemoteRevision((r) => r + 1));
        supabase.rpc('touch_last_seen').then(() => {}, () => {});
      } catch (e) {
        if (!live) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
    return () => { live = false; };
  }, [userId, attempt]);

  const signOut = useCallback(async () => {
    const uid = userId;
    // Push anything not yet uploaded; the on-phone copy is erased on sign-out.
    await syncNow().catch(() => {});
    if (uid && (await pendingChanges().catch(() => 0)) > 0) {
      throw new Error('Some entries haven\'t been uploaded yet. Connect to the internet and try again, so nothing is lost.');
    }
    stopSync();
    await clearDeviceTraces();
    if (uid) await eraseUserDatabase(uid);
    await signOutOfGoogle();
    await supabase.auth.signOut();
    setProfile(DEFAULT_PROFILE);
  }, [userId]);

  const deleteAccount = useCallback(async () => {
    const uid = userId;
    const { error: e } = await supabase.rpc('delete_my_account');
    if (e) throw new Error(e.message);
    stopSync();
    await clearDeviceTraces();
    if (uid) await eraseUserDatabase(uid);
    await signOutOfGoogle();
    await supabase.auth.signOut().catch(() => {});
  }, [userId]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((a) => a + 1);
  }, []);

  const value = useMemo<AuthValue>(() => ({
    status, user: session?.user ?? null, profile, error, remoteRevision, signOut, deleteAccount, retry,
  }), [status, session, profile, error, remoteRevision, signOut, deleteAccount, retry]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
