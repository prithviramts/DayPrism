import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SunMotif } from '../../features/auth-ui';
import { Icon, Txt } from '../../ui/kit';
import { Logo } from '../../ui/logo';
import { radius, space, useTheme } from '../../ui/theme';

/** First screen for signed-out users: what DayPrism is, and the two ways in. */
export default function WelcomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const feature = (icon: string, title: string, text: string) => (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={22} color="#ffffff" />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" color="#ffffff">{title}</Txt>
        <Txt variant="caption" color="rgba(255,255,255,0.75)" style={{ fontSize: 13, lineHeight: 18 }}>{text}</Txt>
      </View>
    </View>
  );

  return (
    <LinearGradient colors={[t.heroFrom, t.heroTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <SunMotif size={520} opacity={0.1} />
      <View style={{ flex: 1, paddingTop: insets.top + space.xxl, paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Logo size={44} inverse />
          <Txt variant="title" color="#ffffff">DayPrism</Txt>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
          <Txt color="#ffffff" variant="display" style={{ fontSize: 38, lineHeight: 44, letterSpacing: -1 }}>
            Know your days.{'\n'}Own your energy.
          </Txt>
          <Txt variant="body" color="rgba(255,255,255,0.85)" style={{ fontSize: 16, lineHeight: 24 }}>
            Log sleep, food, caffeine and how you feel in seconds. DayPrism finds the patterns that make your best days.
          </Txt>
          <View style={{ gap: space.lg, marginTop: space.sm }}>
            {feature('lightning-bolt', 'Quick daily check-ins', 'Two taps to log energy, mood and meals.')}
            {feature('chart-timeline-variant', 'Insights that explain', 'See how sleep and caffeine shape your day.')}
            {feature('shield-lock-outline', 'Private and secure', 'Encrypted on your phone and in transit.')}
          </View>
        </View>

        <View style={{ gap: space.md }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/sign-up')}
            style={({ pressed }) => ({
              minHeight: 54, borderRadius: radius.md, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Txt variant="bodyStrong" color={t.heroFrom} style={{ fontSize: 16 }}>Create free account</Txt>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/sign-in')}
            style={({ pressed }) => ({
              minHeight: 54, borderRadius: radius.md, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
              alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? 'rgba(255,255,255,0.1)' : 'transparent',
            })}
          >
            <Txt variant="bodyStrong" color="#ffffff" style={{ fontSize: 16 }}>I already have an account</Txt>
          </Pressable>
          <Txt variant="caption" color="rgba(255,255,255,0.7)" style={{ textAlign: 'center', marginTop: space.xs }}>
            By continuing you agree to our{' '}
            <Txt variant="caption" color="#ffffff" style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/terms')}>Terms</Txt>
            {' '}and{' '}
            <Txt variant="caption" color="#ffffff" style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/privacy')}>Privacy Policy</Txt>.
          </Txt>
        </View>
      </View>
    </LinearGradient>
  );
}
