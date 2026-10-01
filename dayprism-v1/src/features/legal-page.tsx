import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Txt } from '../ui/kit';
import { contentColumn, space, useTheme } from '../ui/theme';
import { LEGAL_UPDATED } from './legal';

export function LegalPage({ title, sections }: { title: string; sections: [string, string][] }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.sm }}>
        <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
        <Txt variant="heading" style={{ marginLeft: space.sm }}>{title}</Txt>
      </View>
      <ScrollView contentContainerStyle={[{ padding: space.lg, paddingBottom: insets.bottom + space.xxl, gap: space.lg }, contentColumn]}>
        {sections.map(([heading, body]) => (
          <View key={heading} style={{ gap: 4 }}>
            <Txt variant="bodyStrong">{heading}</Txt>
            <Txt variant="body" color={t.text2}>{body}</Txt>
          </View>
        ))}
        <Txt variant="caption">Last updated {LEGAL_UPDATED}.</Txt>
      </ScrollView>
    </View>
  );
}
