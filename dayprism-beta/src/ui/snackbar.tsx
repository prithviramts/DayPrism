import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from './kit';
import { contentColumn, radius, space, useTheme } from './theme';

// A short message at the bottom of the screen with an optional action, used for "Logged ✓ · Undo"
// after one-tap logging. Disappears after a few seconds.

interface Snack { message: string; action?: { label: string; onPress: () => void } }
const Ctx = createContext<{ show: (s: Snack) => void } | null>(null);

export function useSnackbar() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSnackbar outside SnackbarProvider');
  return v;
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [snack, setSnack] = useState<Snack | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setSnack(null));
  }, [opacity]);

  const show = useCallback((s: Snack) => {
    if (timer.current) clearTimeout(timer.current);
    setSnack(s);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    timer.current = setTimeout(hide, 4500);
  }, [opacity, hide]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {snack ? (
        <Animated.View pointerEvents="box-none" accessibilityLiveRegion="polite"
          style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: insets.bottom + 76, opacity }}>
          <View style={[{
            flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg,
            borderRadius: radius.md, backgroundColor: t.dark ? '#e8ecf4' : '#1e263d',
          }, contentColumn]}>
            <Txt variant="bodyStrong" color={t.dark ? '#0f172a' : '#ffffff'} style={{ flex: 1, fontSize: 14 }}>{snack.message}</Txt>
            {snack.action ? (
              <Pressable hitSlop={10} accessibilityRole="button"
                onPress={() => { snack.action!.onPress(); hide(); }}>
                <Txt variant="bodyStrong" color={t.dark ? '#2a78d6' : '#7fb3f5'} style={{ fontSize: 14 }}>{snack.action.label}</Txt>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}
