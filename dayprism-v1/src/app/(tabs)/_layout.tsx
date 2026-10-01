import { Tabs } from 'expo-router';
import { ColorValue, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../ui/kit';
import { fonts, useTheme } from '../../ui/theme';

export default function TabLayout() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tab = (icon: string, activeIcon: string) =>
    function TabBarIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return <Icon name={focused ? activeIcon : icon} size={24} color={color as string} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 62 + insets.bottom,
          paddingTop: 6,
        },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tab('white-balance-sunny', 'white-balance-sunny') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: tab('calendar-month-outline', 'calendar-month') }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: tab('chart-box-outline', 'chart-box') }} />
      <Tabs.Screen name="review" options={{ title: 'Review', tabBarIcon: tab('notebook-outline', 'notebook') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tab('cog-outline', 'cog') }} />
    </Tabs>
  );
}
