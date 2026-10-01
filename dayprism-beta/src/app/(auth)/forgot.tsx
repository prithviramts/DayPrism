import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AUTH_CALLBACK, supabase } from '../../auth/supabase';
import {
  AuthField, AuthShell, CodeInput, Notice, PasswordStrength, friendlyAuthError, isEmail, passwordProblem,
} from '../../features/auth-ui';
import { Button, Txt } from '../../ui/kit';
import { space, useTheme } from '../../ui/theme';

/**
 * Forgot password, in two steps on one screen:
 *   1. email → we send a 6-digit code (the same response whether or not the account exists,
 *      so this screen can't be used to discover who has an account)
 *   2. code + new password → the code signs you in, then the password is changed
 */
export default function ForgotPasswordScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; code?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!isEmail(email)) {
      setErrors({ email: 'Enter the email you registered with.' });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${AUTH_CALLBACK}?next=reset` });
      if (error) throw error;
      setStep('reset');
    } catch (e) {
      setErrors({ form: friendlyAuthError(e) });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const next: typeof errors = {};
    if (code.length !== 6) next.code = 'Enter the 6-digit code from the email.';
    const pw = passwordProblem(password);
    if (pw) next.password = pw;
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'recovery' });
      if (verifyError) throw verifyError;
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // Now signed in with the new password: the root layout switches to the app.
    } catch (e) {
      setErrors({ form: friendlyAuthError(e) });
    } finally {
      setBusy(false);
    }
  };

  if (step === 'email') {
    return (
      <AuthShell title="Reset your password" subtitle="Enter your email and we'll send you a code to set a new password.">
        {errors.form ? <Notice>{errors.form}</Notice> : null}
        <AuthField label="Email" icon="email-outline" value={email} onChangeText={setEmail} error={errors.email}
          placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email"
          returnKeyType="send" onSubmitEditing={sendCode} />
        <Button title={busy ? 'Sending…' : 'Send reset email'} onPress={sendCode} disabled={busy} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle={`If an account exists for ${email.trim()}, we've emailed it a reset link. Tap it on this phone, or enter the 6-digit code if the email has one.`}>
      {errors.form ? <Notice>{errors.form}</Notice> : null}
      <Txt variant="label" style={{ marginBottom: 6 }}>Code</Txt>
      <CodeInput value={code} onChange={setCode} error={errors.code} />
      <AuthField label="New password" icon="lock-outline" value={password} onChangeText={setPassword} error={errors.password}
        placeholder="At least 8 characters" secure autoComplete="new-password" textContentType="newPassword" />
      <PasswordStrength password={password} />
      <Button title={busy ? 'Saving…' : 'Save new password'} onPress={reset} disabled={busy} />
      <Txt variant="body" color={t.accent} style={{ textAlign: 'center', marginTop: space.xl }}
        onPress={() => { setStep('email'); setCode(''); setErrors({}); }} suppressHighlighting accessibilityRole="button">
        Use a different email or send again
      </Txt>
    </AuthShell>
  );
}
