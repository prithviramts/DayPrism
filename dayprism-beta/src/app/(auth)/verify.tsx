import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AUTH_CALLBACK, supabase } from '../../auth/supabase';
import { AuthShell, CodeInput, Notice, friendlyAuthError } from '../../features/auth-ui';
import { Button, Txt } from '../../ui/kit';
import { space, useTheme } from '../../ui/theme';

const RESEND_SECONDS = 60;

/** Confirms the email address with the 6-digit code from the sign-up email. */
export default function VerifyScreen() {
  const t = useTheme();
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const verify = async (value = code) => {
    if (value.length !== 6) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const { error: e } = await supabase.auth.verifyOtp({ email, token: value, type: 'email' });
      if (e) throw e;
      // Verified and signed in: the root layout switches to the app.
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(undefined);
    try {
      const { error: e } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: AUTH_CALLBACK } });
      if (e) throw e;
      setInfo('We sent a new email. It can take a minute to arrive; check your spam folder too.');
      setWait(RESEND_SECONDS);
    } catch (e) {
      setError(friendlyAuthError(e));
    }
  };

  return (
    <AuthShell title="Check your email" subtitle={`We sent a confirmation email to ${email}. Tap the link in it on this phone, or enter the 6-digit code if the email has one.`}>
      {info ? <Notice tone="info">{info}</Notice> : null}
      <CodeInput value={code} error={error} onChange={(v) => { setCode(v); if (v.length === 6) verify(v); }} />
      <Button title={busy ? 'Verifying…' : 'Verify email'} onPress={() => verify()} disabled={busy} />
      <View style={{ alignItems: 'center', marginTop: space.xl }}>
        {wait > 0 ? (
          <Txt variant="body" color={t.muted}>Resend email in {wait}s</Txt>
        ) : (
          <Txt variant="bodyStrong" color={t.accent} onPress={resend} accessibilityRole="button" suppressHighlighting>Resend email</Txt>
        )}
      </View>
    </AuthShell>
  );
}
