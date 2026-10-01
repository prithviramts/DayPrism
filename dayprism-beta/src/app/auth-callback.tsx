import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { supabase } from '../auth/supabase';
import { AuthField, AuthShell, Notice, PasswordStrength, friendlyAuthError, passwordProblem } from '../features/auth-ui';
import { Button, Loading, Txt } from '../ui/kit';
import { space, useTheme } from '../ui/theme';

/**
 * Where links in DayPrism emails land: dayprism://auth-callback?code=…  (email confirmation)
 * or dayprism://auth-callback?next=reset&code=…  (password reset). The one-time code is exchanged
 * for a session; that only works in the same app install that asked for the email (PKCE).
 */
export default function AuthCallbackScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ code?: string; next?: string; error_description?: string }>();
  const [state, setState] = useState<'working' | 'reset' | 'failed'>('working');
  const [message, setMessage] = useState<string>();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      if (params.error_description) {
        setMessage(params.error_description.replace(/\+/g, ' '));
        setState('failed');
        return;
      }
      if (!params.code) {
        setMessage('This link is missing its code. Request a new email and try again.');
        setState('failed');
        return;
      }
      const { error: e } = await supabase.auth.exchangeCodeForSession(params.code);
      if (e) {
        setMessage(e.message.toLowerCase().includes('code verifier')
          ? 'Open the link on the same phone where you requested it, or request a new email.'
          : friendlyAuthError(e));
        setState('failed');
        return;
      }
      if (params.next === 'reset') setState('reset');
      else router.replace('/');
    })();
  }, [params.code, params.next, params.error_description]);

  const save = async () => {
    const problem = passwordProblem(password);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (e) throw e;
      router.replace('/');
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  if (state === 'reset') {
    return (
      <AuthShell title="Choose a new password" subtitle="You're verified. Pick a new password for your account." back={false}>
        <AuthField label="New password" icon="lock-outline" value={password} onChangeText={setPassword} error={error}
          placeholder="At least 8 characters" secure autoComplete="new-password" textContentType="newPassword" autoFocus />
        <PasswordStrength password={password} />
        <Button title={busy ? 'Saving…' : 'Save new password'} onPress={save} disabled={busy} />
      </AuthShell>
    );
  }

  if (state === 'failed') {
    return (
      <AuthShell title="That link didn't work" back={false}>
        <Notice>{message}</Notice>
        <Button title="Back to sign in" onPress={() => router.replace('/sign-in')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Just a moment" subtitle="Confirming your email…" back={false}>
      <Loading />
      <Txt variant="caption" style={{ textAlign: 'center', marginTop: space.md }} color={t.muted}>This only takes a second.</Txt>
    </AuthShell>
  );
}
