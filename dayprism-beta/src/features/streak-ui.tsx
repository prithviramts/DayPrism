import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, View } from 'react-native';

import { fmtDate } from '../lib/time';
import { StreakInfo, milestoneToCelebrate } from '../services/streaks';
import { Button, Icon, Txt } from '../ui/kit';
import { alpha, radius, space, useTheme } from '../ui/theme';

export const FLAME = '#ff7a2f';

/** The flame and number next to the greeting. Grey until something is logged today. */
export function StreakChip({ streak }: { streak: StreakInfo }) {
  const t = useTheme();
  const lit = streak.loggedToday;
  const color = lit ? FLAME : t.muted;
  return (
    <Pressable
      onPress={() => router.push('/week')}
      accessibilityRole="button"
      accessibilityLabel={`${streak.current} day streak${lit ? '' : ', log something today to keep it'}. Opens your week.`}
      hitSlop={8}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7,
        borderRadius: radius.pill, backgroundColor: alpha(color, lit ? 0.14 : 0.1), opacity: pressed ? 0.75 : 1, marginBottom: 4,
      })}
    >
      <Icon name={lit ? 'fire' : 'fire-off'} size={20} color={color} />
      <Txt variant="number" style={{ fontSize: 17 }} color={lit ? FLAME : t.text2}>{streak.current}</Txt>
    </Pressable>
  );
}

/** The last seven days as dots, today last. */
export function WeekDots({ streak }: { streak: StreakInfo }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {streak.lastSeven.map((d, i) => {
        const isToday = i === 6;
        return (
          <View key={d.date} style={{ alignItems: 'center', gap: 4, flex: 1 }}>
            <View style={{
              width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
              backgroundColor: d.logged ? FLAME : 'transparent', borderWidth: d.logged ? 0 : 1.5,
              borderColor: isToday ? FLAME : t.grid, borderStyle: isToday && !d.logged ? 'dashed' : 'solid',
            }}>
              {d.logged ? <Icon name="check" size={16} color="#ffffff" /> : null}
            </View>
            <Txt variant="caption" style={{ fontSize: 11 }} color={isToday ? t.text : undefined}>{fmtDate(d.date, 'ddd').slice(0, 2)}</Txt>
          </View>
        );
      })}
    </View>
  );
}

const MILESTONE_COPY: Record<number, string> = {
  3: 'Three days in a row. That\'s how habits start.',
  7: 'A full week. Your patterns are starting to show.',
  14: 'Two weeks of showing up for yourself.',
  30: 'A whole month! Your insights are getting really good now.',
  50: 'Fifty days. That\'s real commitment.',
  100: 'One hundred days. Truly remarkable.',
};

/** Celebrates a streak milestone once (3, 7, 14, 30, 50, 100… days). */
export function MilestoneCelebration({ streak }: { streak: StreakInfo | undefined }) {
  const t = useTheme();
  const [milestone, setMilestone] = useState<number | null>(null);
  const [scale] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    if (!streak) return;
    let live = true;
    milestoneToCelebrate(streak).then((m) => { if (live && m) setMilestone(m); }, () => {});
    return () => { live = false; };
  }, [streak]);

  useEffect(() => {
    if (milestone == null) return;
    scale.setValue(0.4);
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.08, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const timer = setTimeout(() => pulse.start(), 600);
    return () => { clearTimeout(timer); pulse.stop(); };
  }, [milestone, scale]);

  if (milestone == null) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setMilestone(null)} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(5, 10, 25, 0.6)', alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <View style={{ backgroundColor: t.surface, borderRadius: radius.lg + 8, padding: space.xl, alignItems: 'center', gap: space.md, width: '100%', maxWidth: 380 }}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: alpha(FLAME, 0.14), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="fire" size={72} color={FLAME} />
            </View>
          </Animated.View>
          <Txt variant="display" style={{ textAlign: 'center' }}>{milestone}-day streak!</Txt>
          <Txt variant="body" color={t.text2} style={{ textAlign: 'center' }}>
            {MILESTONE_COPY[milestone] ?? `${milestone} days in a row. Keep shining.`}
          </Txt>
          <Button title="Keep going" onPress={() => setMilestone(null)} style={{ alignSelf: 'stretch', marginTop: space.sm }} />
        </View>
      </View>
    </Modal>
  );
}
