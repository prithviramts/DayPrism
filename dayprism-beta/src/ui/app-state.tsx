import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../auth/session';
import * as repo from '../db/repo';
import { DEFAULT_SETTINGS, UserSettings } from '../lib/domain';
import { today } from '../lib/time';
import { localChanged } from '../sync/signal';

// App-wide state for the signed-in user: their settings, and a "revision" number that goes up
// after every change (local or synced from the server). Screens load their data with useData(),
// which re-runs when the revision changes. All reads are local, so re-querying is cheap.

interface AppStateValue {
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  revision: number;
  /** Call after any local write. */
  changed: () => void;
  /** Today's date; rolls over at midnight and when the app returns to the foreground. */
  today: string;
  isAdmin: boolean;
}

const Ctx = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { status, remoteRevision, profile } = useAuth();
  const ready = status === 'ready';
  const [loaded, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  // Signed out (or still opening): defaults, so the auth screens follow the phone's theme.
  const settings = ready ? loaded : DEFAULT_SETTINGS;
  const [localRevision, setRevision] = useState(0);
  // Screens reload on local writes and when synced data arrives.
  const revision = localRevision + remoteRevision;
  const [day, setDay] = useState(today());
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const changed = useCallback(() => setRevision((r) => r + 1), []);

  // (Re)load settings when the database opens and whenever synced data arrives.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    repo.loadSettings().then((s) => { if (live) setSettings(s); }, () => {});
    return () => { live = false; };
  }, [ready, remoteRevision]);

  const updateSettings = useCallback(async (patch: Partial<UserSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    await repo.saveSettings(next);
    settingsRef.current = next;
    setSettings(next);
    changed();
    localChanged();
  }, [changed]);

  // Refresh when returning to the app (the day may have changed, a running timer moved on).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        setDay(today());
        changed();
      }
    });
    const tick = setInterval(() => setDay((d) => (d === today() ? d : today())), 60_000);
    return () => { sub.remove(); clearInterval(tick); };
  }, [changed]);

  const isAdmin = ready && profile.role === 'admin';
  const value = useMemo(() => ({ settings, updateSettings, revision, changed, today: day, isAdmin }),
    [settings, updateSettings, revision, changed, day, isAdmin]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppStateProvider');
  return v;
}

/** Loads data and reloads it after every change. Keeps showing the previous value while reloading. */
export function useData<T>(load: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: string | null } {
  const { revision } = useApp();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    load().then(
      (d) => { if (live) { setData(d); setError(null); } },
      (e) => { if (live) setError(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, ...deps]);

  return { data, error };
}
