import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, View } from 'react-native';

import { Button, Txt } from '../ui/kit';
import { Logo } from '../ui/logo';
import { space, useTheme } from '../ui/theme';

// App lock is a setting of this phone, not of the account: it lives in the secure store, so it
// still applies after signing out and back in, and doesn't follow the account to other devices.
const LOCK_KEY = 'dayprism.applock';
let lockEnabled = false;
const lockListeners = new Set<() => void>();

/** Reads the saved setting once at launch. */
export async function loadAppLockSetting(): Promise<void> {
  lockEnabled = (await SecureStore.getItemAsync(LOCK_KEY).catch(() => null)) === '1';
  for (const l of lockListeners) l();
}

export async function setAppLockEnabled(on: boolean): Promise<void> {
  if (on) await SecureStore.setItemAsync(LOCK_KEY, '1');
  else await SecureStore.deleteItemAsync(LOCK_KEY);
  lockEnabled = on;
  for (const l of lockListeners) l();
}

export function useAppLockEnabled(): boolean {
  return useSyncExternalStore(
    (l) => { lockListeners.add(l); return () => lockListeners.delete(l); },
    () => lockEnabled,
  );
}

/** How long the app can sit in the background before it asks again. */
const GRACE_MS = 30_000;

/** True when the phone has a fingerprint, face or screen lock that can protect the app. */
export async function canUseAppLock(): Promise<boolean> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

export async function authenticate(prompt: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    cancelLabel: 'Cancel',
    // Falls back to the phone's PIN, pattern or password, so a failed fingerprint never locks you out.
    disableDeviceFallback: false,
  });
  return result.success;
}

/**
 * Covers the app until you unlock it with your fingerprint, face or phone PIN. Asks on launch
 * and again after the app has been in the background for more than 30 seconds.
 */
export function LockGate({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const t = useTheme();
  const [locked, setLocked] = useState(enabled);
  const backgroundedAt = useRef<number | null>(null);
  // The PIN fallback is its own screen, which sends the app to the background; ignore that.
  const authenticating = useRef(false);

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      if (await authenticate('Unlock DayPrism')) setLocked(false);
    } finally {
      authenticating.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (authenticating.current) return;
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active' && backgroundedAt.current != null) {
        if (Date.now() - backgroundedAt.current > GRACE_MS) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled]);

  // Ask straight away whenever the lock screen appears.
  useEffect(() => { if (enabled && locked) unlock(); }, [enabled, locked, unlock]);

  if (!enabled || !locked) return <>{children}</>;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, backgroundColor: t.bg, gap: space.lg }}>
      <Logo size={72} />
      <Txt variant="title">DayPrism is locked</Txt>
      <Txt variant="body" color={t.text2} style={{ textAlign: 'center' }}>
        Unlock with your fingerprint, face or phone PIN.
      </Txt>
      <Button title="Unlock" icon="fingerprint" onPress={unlock} style={{ alignSelf: 'stretch', marginTop: space.md }} />
    </View>
  );
}
