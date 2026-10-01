import { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, Txt } from './kit';
import { contentColumn, radius, space, useTheme } from './theme';

/** A bottom sheet: dimmed backdrop, rounded panel, scrollable body, fixed action bar. */
export function Sheet({ visible, title, onClose, children, onSave, saveLabel = 'Save', onDelete, saving }: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  onSave?: () => void;
  saveLabel?: string;
  onDelete?: () => void;
  saving?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5, 10, 25, 0.45)' }]} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <View style={{
          backgroundColor: t.surface, borderTopLeftRadius: radius.lg + 6, borderTopRightRadius: radius.lg + 6,
          maxHeight: '92%', paddingBottom: insets.bottom, ...contentColumn,
        }}>
          <View style={{ alignItems: 'center', paddingTop: space.sm }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.grid }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md }}>
            <Txt variant="title" style={{ flex: 1 }}>{title}</Txt>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
            {children}
          </ScrollView>
          {onSave ? (
            <View style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md }}>
              {onDelete ? <Button kind="danger" title="Delete" icon="trash-can-outline" onPress={onDelete} style={{ flex: 1 }} /> : null}
              <Button title={saveLabel} onPress={onSave} disabled={saving} style={{ flex: 2 }} />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
