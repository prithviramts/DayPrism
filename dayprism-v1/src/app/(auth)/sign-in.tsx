import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { googleEnabled, signInWithGoogle } from '../../auth/google';
import { AUTH_CALLBACK, supabase } from '../../auth/supabase';
import {
  AuthField, AuthShell, FooterLink, GoogleButton, Notice, OrDivider, friendlyAuthError, isEmail,
} from '../../features/auth-ui';
import { Button, Txt } from '../../ui/kit';
import { space, useTheme } from '../../ui/theme';

export default function SignInScreen() {
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (!isEmail(email)) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: AUTH_CALLBACK } }).catch(() => {});
          router.push({ pathname: '/verify', params: { email: email.trim() } });
          return;
        }
        throw error;
      }
      // Signed in: the root layout switches to the app.
    } catch (e) {
      setErrors({ form: friendlyAuthError(e) });
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setErrors({});
    try {
      await signInWithGoogle();
    } catch (e) {
      setErrors({ form: friendlyAuthError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to pick up where you left off.">
      {errors.form ? <Notice>{errors.form}</Notice> : null}
      <AuthField label="Email" icon="email-outline" value={email} onChangeText={setEmail} error={errors.email}
        placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email"
        textContentType="emailAddress" returnKeyType="next" />
      <AuthField label="Password" icon="lock-outline" value={password} onChangeText={setPassword} error={errors.password}
        placeholder="Your password" secure autoComplete="current-password" textContentType="password"
        returnKeyType="go" onSubmitEditing={submit} />
      <View style={{ alignItems: 'flex-end', marginTop: -space.sm, marginBottom: space.lg }}>
        <Txt variant="label" color={t.accent} onPress={() => router.push({ pathname: '/forgot', params: { email: email.trim() } })}
          accessibilityRole="link" suppressHighlighting>Forgot password?</Txt>
      </View>
      <Button title={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy} />
      {googleEnabled ? (
        <>
          <OrDivider />
          <GoogleButton onPress={google} disabled={busy} />
        </>
      ) : null}
      <FooterLink text="New to DayPrism?" link="Create an account" onPress={() => router.replace('/sign-up')} />
    </AuthShell>
  );
}
