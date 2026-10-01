import {
  PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold, useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../auth/session';
import { DailyServices } from '../features/daily-services';
import { EntrySheetsProvider } from '../features/entry-sheets';
import { LockGate, loadAppLockSetting, useAppLockEnabled } from '../features/lock';
import { AppStateProvider, useApp } from '../ui/app-state';
import { Button, Txt } from '../ui/kit';
import { Logo } from '../ui/logo';
import { SnackbarProvider } from '../ui/snackbar';
import { space, ThemeContext, themes, useTheme } from '../ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  });
  // The app-lock setting must be known before anything renders, or the app would flash unlocked.
  const [lockLoaded, setLockLoaded] = useState(false);
  useEffect(() => { loadAppLockSetting().finally(() => setLockLoaded(true)); }, []);

  if (!fontsLoaded || !lockLoaded) return null;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppStateProvider>
          <Themed />
        </AppStateProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function Themed() {
  const { settings } = useApp();
  const { status } = useAuth();
  const system = useColorScheme();
  const mode = settings.theme === 'System' ? (system === 'dark' ? 'dark' : 'light') : settings.theme === 'Dark' ? 'dark' : 'light';
  const t = themes[mode];
  const lock = useAppLockEnabled();

  useEffect(() => { SystemUI.setBackgroundColorAsync(t.bg).catch(() => {}); }, [t.bg]);
  useEffect(() => { if (status !== 'loading') SplashScreen.hideAsync().catch(() => {}); }, [status]);

  // With the app lock on, also hide the app's content from the recent-apps switcher and screenshots.
  useEffect(() => {
    (lock ? ScreenCapture.preventScreenCaptureAsync('lock') : ScreenCapture.allowScreenCaptureAsync('lock')).catch(() => {});
  }, [lock]);

  return (
    <ThemeContext.Provider value={t}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Gate lock={lock} />
      </View>
    </ThemeContext.Provider>
  );
}

function Gate({ lock }: { lock: boolean }) {
  const t = useTheme();
  const { status, profile } = useAuth();

  if (status === 'loading') return null; // splash screen still showing
  if (status === 'error') return <OpenError />;
  if (status === 'ready' && profile.disabled) return <Disabled />;

  const signedIn = status === 'ready';
  return (
    <LockGate enabled={signedIn && lock}>
      <SnackbarProvider>
      <EntrySheetsProvider>
        {signedIn ? <DailyServices /> : null}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'slide_from_right' }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="day/[date]" />
            <Stack.Screen name="admin" />
            <Stack.Screen name="quick" options={{ animation: 'none' }} />
            <Stack.Screen name="trackers" />
            <Stack.Screen name="week" />
            <Stack.Screen name="nutrition" />
          </Stack.Protected>
          <Stack.Screen name="auth-callback" />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="terms" />
        </Stack>
      </EntrySheetsProvider>
      </SnackbarProvider>
    </LockGate>
  );
}

function OpenError() {
  const t = useTheme();
  const { error, retry, signOut } = useAuth();
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: space.xxl, backgroundColor: t.bg, gap: space.md }}>
      <Logo size={56} />
      <Txt variant="title" style={{ marginTop: space.md }}>Couldn&apos;t open your data</Txt>
      <Txt variant="body" color={t.text2}>
        Your entries are stored encrypted on this phone and in your account. The phone&apos;s secure storage didn&apos;t respond. Nothing has been deleted.
      </Txt>
      {error ? <Txt variant="caption">{error}</Txt> : null}
      <Button title="Try again" onPress={retry} style={{ marginTop: space.md }} />
      <Button title="Sign out" kind="ghost" onPress={() => { signOut().catch(() => {}); }} />
    </View>
  );
}

function Disabled() {
  const t = useTheme();
  const { signOut } = useAuth();
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: space.xxl, backgroundColor: t.bg, gap: space.md }}>
      <Logo size={56} />
      <Txt variant="title" style={{ marginTop: space.md }}>This account is disabled</Txt>
      <Txt variant="body" color={t.text2}>
        If you think this is a mistake, contact support from the Play Store listing.
      </Txt>
      <Button title="Sign out" kind="secondary" onPress={() => { signOut().catch(() => {}); }} style={{ marginTop: space.md }} />
    </View>
  );
}
