import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { googleEnabled, signInWithGoogle } from '../../auth/google';
import { AUTH_CALLBACK, supabase } from '../../auth/supabase';
import {
  AuthField, AuthShell, FooterLink, GoogleButton, Notice, OrDivider, PasswordStrength, friendlyAuthError, isEmail, passwordProblem,
} from '../../features/auth-ui';
import { Button, Icon, Txt } from '../../ui/kit';
import { radius, space, useTheme } from '../../ui/theme';

export default function SignUpScreen() {
  const t = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; agreed?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Tell us what to call you.';
    if (!isEmail(email)) next.email = 'Enter a valid email address.';
    const pw = passwordProblem(password);
    if (pw) next.password = pw;
    if (!agreed) next.agreed = 'Please accept the Terms and Privacy Policy to continue.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: name.trim().slice(0, 40) }, emailRedirectTo: AUTH_CALLBACK },
      });
      if (error) throw error;
      // With email confirmation on (recommended), there's no session until the code is entered.
      if (!data.session) router.push({ pathname: '/verify', params: { email: email.trim() } });
    } catch (e) {
      setErrors({ form: friendlyAuthError(e) });
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (!agreed) {
      setErrors({ agreed: 'Please accept the Terms and Privacy Policy to continue.' });
      return;
    }
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
    <AuthShell title="Create your account" subtitle="Free, private, and ready in under a minute.">
      {errors.form ? <Notice>{errors.form}</Notice> : null}
      <AuthField label="Name" icon="account-outline" value={name} onChangeText={setName} error={errors.name}
        placeholder="Your first name" autoCapitalize="words" autoComplete="name-given" textContentType="givenName"
        maxLength={40} returnKeyType="next" />
      <AuthField label="Email" icon="email-outline" value={email} onChangeText={setEmail} error={errors.email}
        placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email"
        textContentType="emailAddress" returnKeyType="next" />
      <AuthField label="Password" icon="lock-outline" value={password} onChangeText={setPassword} error={errors.password}
        placeholder="At least 8 characters" secure autoComplete="new-password" textContentType="newPassword" />
      <PasswordStrength password={password} />

      <Pressable onPress={() => { setAgreed(!agreed); setErrors((e) => ({ ...e, agreed: undefined })); }}
        accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}
        style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', marginBottom: errors.agreed ? space.xs : space.lg }}>
        <View style={{
          width: 24, height: 24, borderRadius: 7, marginTop: 1, alignItems: 'center', justifyContent: 'center',
          backgroundColor: agreed ? t.accent : 'transparent', borderWidth: 2, borderColor: agreed ? t.accent : errors.agreed ? t.danger : t.muted,
        }}>
          {agreed ? <Icon name="check" size={16} color="#ffffff" /> : null}
        </View>
        <Txt variant="body" color={t.text2} style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
          I agree to the{' '}
          <Txt variant="bodyStrong" color={t.accent} style={{ fontSize: 14 }} onPress={() => router.push('/terms')}>Terms of Service</Txt>
          {' '}and{' '}
          <Txt variant="bodyStrong" color={t.accent} style={{ fontSize: 14 }} onPress={() => router.push('/privacy')}>Privacy Policy</Txt>.
        </Txt>
      </Pressable>
      {errors.agreed ? <Txt variant="caption" color={t.danger} style={{ marginBottom: space.lg, marginLeft: 36 }}>{errors.agreed}</Txt> : null}

      <Button title={busy ? 'Creating account…' : 'Create account'} onPress={submit} disabled={busy} />
      {googleEnabled ? (
        <>
          <OrDivider />
          <GoogleButton onPress={google} disabled={busy} />
        </>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center', marginTop: space.xl, padding: space.md, borderRadius: radius.md, backgroundColor: t.surface2 }}>
        <Icon name="shield-check-outline" size={16} color={t.success} />
        <Txt variant="caption" style={{ flexShrink: 1 }}>Your entries are private to your account. We never sell your data.</Txt>
      </View>
      <FooterLink text="Already have an account?" link="Sign in" onPress={() => router.replace('/sign-in')} />
    </AuthShell>
  );
}
