import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ComponentProps, ReactNode, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { isConfigured } from '../auth/supabase';
import { Button, Icon, Txt } from '../ui/kit';
import { Logo } from '../ui/logo';
import { alpha, contentColumn, fonts, radius, space, useTheme } from '../ui/theme';

// Building blocks for the welcome, sign-in, sign-up, verify and reset screens.

/** Brand header (gradient with the sun motif) over a rounded form sheet. */
export function AuthShell({ title, subtitle, children, back = true }: {
  title: string; subtitle?: string; children: ReactNode; back?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.surface }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        <LinearGradient colors={[t.heroFrom, t.heroTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.xl, paddingBottom: space.xxl + 28, overflow: 'hidden' }}>
          <SunMotif core={false} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
            {back ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="arrow-left" size={22} color="#ffffff" />
              </Pressable>
            ) : <View />}
            <Logo size={40} inverse />
          </View>
          <Txt variant="display" color="#ffffff" style={{ marginTop: space.xl }}>{title}</Txt>
          {subtitle ? <Txt variant="body" color="rgba(255,255,255,0.82)" style={{ marginTop: space.sm }}>{subtitle}</Txt> : null}
        </LinearGradient>
        <View style={{
          flex: 1, backgroundColor: t.surface, marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: insets.bottom + space.xl,
        }}>
          <View style={contentColumn}>
            {!isConfigured ? <NotConfigured /> : null}
            {children}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Concentric "sunrise" arcs in the header: the logo's sun, echoed as a quiet background pattern. */
export function SunMotif({ size = 360, opacity = 0.12, core = true }: { size?: number; opacity?: number; core?: boolean }) {
  return (
    <Svg width={size} height={size} style={{ position: 'absolute', right: -size * 0.35, top: -size * 0.3 }} pointerEvents="none">
      {[0.2, 0.32, 0.44, 0.56].map((f) => (
        <Circle key={f} cx={size / 2} cy={size / 2} r={size * f} stroke="#ffffff" strokeOpacity={opacity} strokeWidth={1.5} fill="none" />
      ))}
      {core ? <Circle cx={size / 2} cy={size / 2} r={size * 0.09} fill="#ffffff" fillOpacity={opacity * 1.4} /> : null}
    </Svg>
  );
}

function NotConfigured() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: alpha(t.tint.caffeine, 0.14), marginBottom: space.lg }}>
      <Icon name="server-off" size={18} color={t.tint.caffeine} />
      <Txt variant="caption" color={t.text2} style={{ flex: 1 }}>
        This build isn&apos;t connected to a server yet. Add the Supabase URL and key to .env and rebuild.
      </Txt>
    </View>
  );
}

/** Labelled text input with a leading icon; password fields get a show/hide toggle. */
export function AuthField({ label, icon, error, secure, ...rest }: ComponentProps<typeof TextInput> & {
  label: string; icon: string; error?: string; secure?: boolean;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  return (
    <View style={{ marginBottom: space.lg }}>
      <Txt variant="label" style={{ marginBottom: 6 }}>{label}</Txt>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 54, paddingHorizontal: space.md,
        borderRadius: radius.md, backgroundColor: t.surface2,
        borderWidth: 1.5, borderColor: error ? t.danger : focused ? t.accent : 'transparent',
      }}>
        <Icon name={icon} size={20} color={focused ? t.accent : t.muted} />
        <TextInput
          {...rest}
          secureTextEntry={secure ? hidden : false}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          placeholderTextColor={t.muted}
          style={{ flex: 1, color: t.text, fontFamily: fonts.regular, fontSize: 16, paddingVertical: 12 }}
        />
        {secure ? (
          <Pressable onPress={() => setHidden(!hidden)} hitSlop={10} accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
            <Icon name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={t.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Txt variant="caption" color={t.danger} style={{ marginTop: 6 }}>{error}</Txt> : null}
    </View>
  );
}

/** 0–4. Length matters most; mixing character types adds the rest. */
export function passwordScore(pw: string): number {
  if (pw.length < 8) return pw.length === 0 ? 0 : 1;
  let score = 1;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  else if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score += 0.5;
  return Math.min(4, Math.floor(score));
}

/** The password rule shared by sign-up and reset. Returns an error message or null. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use both letters and numbers.';
  return null;
}

export function PasswordStrength({ password }: { password: string }) {
  const t = useTheme();
  if (!password) return null;
  const score = passwordScore(password);
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = [t.danger, t.danger, t.tint.caffeine, t.success, t.success];
  return (
    <View style={{ marginTop: -space.sm, marginBottom: space.lg }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= score ? colors[score] : t.grid }} />
        ))}
      </View>
      <Txt variant="caption" style={{ marginTop: 4 }}>{labels[score]}</Txt>
    </View>
  );
}

/** Six boxes backed by one hidden input, so paste and SMS autofill work. */
export function CodeInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const t = useTheme();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: space.lg }}>
      <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'space-between' }}
        accessibilityLabel={`Verification code, ${value.length} of 6 digits entered`}>
        {Array.from({ length: 6 }, (_, i) => {
          const active = focused && (i === value.length || (i === 5 && value.length === 6));
          return (
            <View key={i} style={{
              flex: 1, aspectRatio: 0.85, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
              backgroundColor: t.surface2, borderWidth: 1.5, borderColor: error ? t.danger : active ? t.accent : 'transparent',
            }}>
              <Txt variant="title" style={{ fontSize: 26 }}>{value[i] ?? ''}</Txt>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        autoFocus
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
      {error ? <Txt variant="caption" color={t.danger} style={{ marginTop: 8 }}>{error}</Txt> : null}
    </View>
  );
}

export function OrDivider() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginVertical: space.lg }}>
      <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
      <Txt variant="caption">or</Txt>
      <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
    </View>
  );
}

/** Follows Google's branding guidance: white/neutral button, the multicolour G, "Continue with Google". */
export function GoogleButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: 52, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md,
        backgroundColor: t.dark ? '#131314' : '#ffffff', borderWidth: 1, borderColor: t.dark ? '#8e918f' : '#747775',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Svg width={20} height={20} viewBox="0 0 48 48">
        <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </Svg>
      <Txt variant="bodyStrong" color={t.dark ? '#e3e3e3' : '#1f1f1f'}>Continue with Google</Txt>
    </Pressable>
  );
}

/** A form-level error or notice box. */
export function Notice({ tone = 'error', children }: { tone?: 'error' | 'info'; children: ReactNode }) {
  const t = useTheme();
  const color = tone === 'error' ? t.danger : t.accent;
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: alpha(color, 0.1), marginBottom: space.lg }}>
      <Icon name={tone === 'error' ? 'alert-circle-outline' : 'information-outline'} size={18} color={color} />
      <Txt variant="caption" color={t.text} style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>{children}</Txt>
    </View>
  );
}

export function FooterLink({ text, link, onPress }: { text: string; link: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: space.xl, flexWrap: 'wrap' }}>
      <Txt variant="body" color={t.text2}>{text} </Txt>
      <Txt variant="bodyStrong" color={t.accent} onPress={onPress} suppressHighlighting accessibilityRole="link">{link}</Txt>
    </View>
  );
}

/** Supabase error → a sentence a person can act on. */
export function friendlyAuthError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase();
  if (msg.includes('invalid login credentials')) return 'That email and password don\'t match. Check them, or reset your password.';
  if (msg.includes('email not confirmed')) return 'Please confirm your email first. We can send you a new code.';
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'An account with this email already exists. Sign in instead.';
  if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('security purposes')) return 'Too many attempts. Please wait a minute and try again.';
  if (msg.includes('expired') || msg.includes('invalid') && msg.includes('token')) return 'That code is wrong or has expired. Request a new one.';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to')) return 'Can\'t reach DayPrism right now. Check your internet connection and try again.';
  if (msg.includes('weak') || msg.includes('password should')) return 'Choose a stronger password: at least 8 characters with letters and numbers.';
  return e instanceof Error ? e.message : 'Something went wrong. Please try again.';
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export { Button };
