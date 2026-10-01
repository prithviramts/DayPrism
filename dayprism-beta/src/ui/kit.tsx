import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleProp, StyleSheet, Switch, Text, TextInput, TextProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { showTime, uses24h } from '../lib/time';
import { alpha, contentColumn, fonts, radius, space, Theme, useTheme } from './theme';

// The building blocks every screen uses, so spacing, type and colour stay consistent.

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color }: { name: string; size?: number; color?: string }) {
  const t = useTheme();
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color ?? t.text} />;
}

// ---------------------------------------------------------------- text

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'number';

const variantStyle = (t: Theme): Record<Variant, TextStyle> => ({
  display: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, color: t.text },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, color: t.text },
  heading: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: t.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: t.text },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: t.text },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: t.text2 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: t.muted },
  number: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 24, letterSpacing: -0.3, color: t.text, fontVariant: ['tabular-nums'] },
});

/**
 * Large system font sizes are respected, up to a cap: beyond ~1.35× (1.2× for big numbers and
 * titles) fixed-size tiles and charts start clipping, which helps nobody.
 */
const FONT_SCALE_CAP: Record<Variant, number> = {
  display: 1.2, title: 1.2, heading: 1.3, body: 1.35, bodyStrong: 1.35, label: 1.35, caption: 1.35, number: 1.2,
};

export function Txt({ variant = 'body', color, style, ...rest }: TextProps & { variant?: Variant; color?: string }) {
  const t = useTheme();
  return <Text maxFontSizeMultiplier={FONT_SCALE_CAP[variant]} {...rest} style={[variantStyle(t)[variant], color ? { color } : null, style]} />;
}

// ---------------------------------------------------------------- layout

/** A scrolling page with safe-area padding and an optional large title. */
export function Screen({ title, subtitle, right, children, scroll = true }: {
  title?: string; subtitle?: string; right?: ReactNode; children: ReactNode; scroll?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={styles.screenHeader}>
      <View style={{ flex: 1 }}>
        {subtitle ? <Txt variant="caption" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{subtitle}</Txt> : null}
        <Txt variant="display">{title}</Txt>
      </View>
      {right}
    </View>
  ) : null;

  if (!scroll) {
    return <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>{header}{children}</View>;
  }
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.xxl * 2 }, contentColumn]}
        keyboardShouldPersistTaps="handled"
      >
        {header}
        {children}
      </ScrollView>
      {/* Edge-to-edge: content scrolls under a solid status-bar strip instead of colliding with the clock. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: t.bg }} />
    </View>
  );
}

export function Card({ children, style, onPress, padded = true }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean;
}) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.surface, borderRadius: radius.lg, padding: padded ? space.lg : 0,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, style, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

export function Section({ title, hint, children, style, action }: {
  title: string; hint?: string; children: ReactNode; style?: StyleProp<ViewStyle>;
  /** Optional link on the right of the heading, e.g. { label: 'Manage', onPress }. */
  action?: { label: string; onPress: () => void };
}) {
  const t = useTheme();
  return (
    <View style={[{ marginTop: space.xl }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginBottom: space.sm, paddingHorizontal: 2 }}>
        <Txt variant="heading" style={{ flexShrink: 0 }}>{title}</Txt>
        {hint ? <Txt variant="caption" style={{ flex: 1 }}>{hint}</Txt> : <View style={{ flex: 1 }} />}
        {action ? (
          <Txt variant="label" color={t.accent} onPress={action.onPress} accessibilityRole="link" suppressHighlighting>{action.label}</Txt>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function Loading() {
  const t = useTheme();
  return <View style={{ padding: space.xxl, alignItems: 'center' }}><ActivityIndicator color={t.accent} /></View>;
}

// ---------------------------------------------------------------- controls

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({ title, onPress, kind = 'primary', icon, disabled, style, compact }: {
  title: string; onPress: () => void; kind?: ButtonKind; icon?: string; disabled?: boolean; style?: StyleProp<ViewStyle>; compact?: boolean;
}) {
  const t = useTheme();
  const bg = { primary: t.accent, secondary: t.surface2, danger: t.dangerSoft, ghost: 'transparent' }[kind];
  const fg = { primary: t.accentInk, secondary: t.text, danger: t.danger, ghost: t.accent }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{
        backgroundColor: bg, borderRadius: radius.md, minHeight: compact ? 40 : 50,
        paddingHorizontal: compact ? space.md : space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      }, style]}
    >
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Txt variant="bodyStrong" color={fg}>{title}</Txt>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color }: { icon: string; onPress: () => void; label: string; color?: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} hitSlop={8}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      <Icon name={icon} size={22} color={color ?? t.text2} />
    </Pressable>
  );
}

export const tap = () => Haptics.selectionAsync().catch(() => {});

/** One-of-N choice as a row of pills. */
export function Segmented<T extends string | number>({ options, value, onChange, wrap = false }: {
  options: { value: T; label: string; icon?: string }[]; value: T | null | undefined; onChange: (v: T) => void; wrap?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', gap: space.sm }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => { tap(); onChange(o.value); }}
            style={{
              flexGrow: wrap ? 0 : 1, flexBasis: wrap ? undefined : 0, minHeight: 44, paddingHorizontal: space.md,
              borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
              backgroundColor: on ? t.accent : t.surface2, borderWidth: 1, borderColor: on ? t.accent : 'transparent',
            }}
          >
            {o.icon ? <Icon name={o.icon} size={16} color={on ? t.accentInk : t.text2} /> : null}
            <Txt variant="label" color={on ? t.accentInk : t.text} numberOfLines={1}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A 1–5 rating as five big tap targets with words at each end. */
export function RatingPicker({ label, value, onChange, low, high, error }: {
  label: string; value: number | null; onChange: (v: number) => void; low: string; high: string; error?: string;
}) {
  return (
    <Field label={label} error={error}>
      <Segmented options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} value={value} onChange={onChange} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 2 }}>
        <Txt variant="caption">{low}</Txt>
        <Txt variant="caption">{high}</Txt>
      </View>
    </Field>
  );
}

export function Field({ label, hint, error, children, style }: {
  label?: string; hint?: string; error?: string; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View style={[{ marginBottom: space.lg }, style]}>
      {label ? (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
          <Txt variant="label">{label}</Txt>
          {hint ? <Txt variant="caption" style={{ marginTop: 1 }}>{hint}</Txt> : null}
        </View>
      ) : null}
      {children}
      {error ? <Txt variant="caption" color={t.danger} style={{ marginTop: 6 }}>{error}</Txt> : null}
    </View>
  );
}

export function Input(props: ComponentProps<typeof TextInput> & { invalid?: boolean }) {
  const t = useTheme();
  const { invalid, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...rest}
      style={[{
        backgroundColor: t.surface2, color: t.text, borderRadius: radius.md, paddingHorizontal: space.md,
        paddingVertical: 12, fontFamily: fonts.regular, fontSize: 15, minHeight: 48,
        borderWidth: 1, borderColor: invalid ? t.danger : 'transparent',
        textAlignVertical: rest.multiline ? 'top' : 'center',
      }, style]}
    />
  );
}

/** − value + */
export function Stepper({ value, onChange, min, max, step = 1, format }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string;
}) {
  const t = useTheme();
  const btn = (icon: string, next: number, label: string) => (
    <Pressable
      accessibilityLabel={label}
      disabled={next < min || next > max}
      onPress={() => { tap(); onChange(Math.round(next * 100) / 100); }}
      style={({ pressed }) => ({
        width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? t.border : t.surface2, opacity: next < min || next > max ? 0.4 : 1,
      })}
    >
      <Icon name={icon} size={20} color={t.text} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      {btn('minus', value - step, 'Decrease')}
      <Txt variant="number" style={{ minWidth: 56, textAlign: 'center' }}>{format ? format(value) : value}</Txt>
      {btn('plus', value + step, 'Increase')}
    </View>
  );
}

/** Shows "HH:mm"; tapping opens the system clock picker. */
export function TimeField({ label, value, onChange, error }: {
  label: string; value: string; onChange: (hhmm: string) => void; error?: string;
}) {
  const t = useTheme();
  const open = () => {
    const [h, m] = value.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    DateTimePickerAndroid.open({
      value: d,
      mode: 'time',
      is24Hour: uses24h,
      onValueChange: (_e, picked) => {
        if (picked) onChange(`${String(picked.getHours()).padStart(2, '0')}:${String(picked.getMinutes()).padStart(2, '0')}`);
      },
    });
  };
  return (
    <Field label={label} error={error} style={{ flex: 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${showTime(value)}. Tap to change`}
        onPress={open}
        style={({ pressed }) => ({
          backgroundColor: t.surface2, borderRadius: radius.md, minHeight: 48, paddingHorizontal: space.md,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: pressed ? 0.8 : 1,
          borderWidth: 1, borderColor: error ? t.danger : 'transparent',
        })}
      >
        <Txt variant="number" style={{ fontSize: 18 }}>{showTime(value)}</Txt>
        <Icon name="clock-outline" size={18} color={t.muted} />
      </Pressable>
    </Field>
  );
}

export function SwitchRow({ label, sub, value, onChange, icon }: {
  label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; icon?: string;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
      {icon ? <IconBadge icon={icon} color={t.accent} /> : null}
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{label}</Txt>
        {sub ? <Txt variant="caption" style={{ marginTop: 2 }}>{sub}</Txt> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.accent, false: t.grid }} thumbColor="#ffffff" />
    </Pressable>
  );
}

/** The app's on/off switch, in brand colours. */
export function Toggle({ value, onValueChange, disabled }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTheme();
  return <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: t.accent, false: t.grid }} thumbColor="#ffffff" />;
}

/** A tinted rounded square holding an icon. */
export function IconBadge({ icon, color, size = 36 }: { icon: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: alpha(color, 0.14), alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.55} color={color} />
    </View>
  );
}

/** A list row: badge, title/sub, optional right side. */
export function Row({ icon, color, title, sub, right, onPress, danger }: {
  icon?: string; color?: string; title: string; sub?: string; right?: ReactNode; onPress?: () => void; danger?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, opacity: pressed ? 0.7 : 1 })}
    >
      {icon ? <IconBadge icon={icon} color={danger ? t.danger : color ?? t.accent} /> : null}
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" color={danger ? t.danger : undefined}>{title}</Txt>
        {sub ? <Txt variant="caption" style={{ marginTop: 2 }}>{sub}</Txt> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={20} color={t.muted} /> : null)}
    </Pressable>
  );
}

/** Progress ring towards a target. Turns red when `over` (a limit, like caffeine). */
export function Ring({ progress, color, icon, size = 52, over }: { progress: number; color: string; icon: string; size?: number; over?: boolean }) {
  const t = useTheme();
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  const ink = over ? t.danger : color;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={alpha(color, 0.16)} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={ink} strokeWidth={stroke} fill="none"
            strokeDasharray={`${c * p} ${c}`} strokeLinecap="round" />
        ) : null}
      </Svg>
      <Icon name={icon} size={size * 0.38} color={ink} />
    </View>
  );
}

export function Empty({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.lg, gap: space.sm }}>
      <IconBadge icon={icon} color={t.muted} size={48} />
      <Txt variant="bodyStrong" style={{ marginTop: space.sm, textAlign: 'center' }}>{title}</Txt>
      {text ? <Txt variant="caption" style={{ textAlign: 'center', maxWidth: 300 }}>{text}</Txt> : null}
      {action ? <View style={{ marginTop: space.md }}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenHeader: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: space.md, marginTop: space.sm, paddingHorizontal: 2 },
});

/** A pushed screen (not a tab): back button, title, scrolling content column. */
export function Page({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.sm }}>
        <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Txt variant="heading" style={{ marginLeft: space.sm, flex: 1 }} numberOfLines={1}>{title}</Txt>
        {right}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={[{ padding: space.lg, paddingTop: space.sm, paddingBottom: insets.bottom + space.xxl * 2 }, contentColumn]}>
        {children}
      </ScrollView>
    </View>
  );
}
