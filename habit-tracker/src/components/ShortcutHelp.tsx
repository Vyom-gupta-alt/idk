import { Modal, Pressable, View } from 'react-native';
import { Card, IconButton, T } from '@/components/ui';
import { space } from '@/theme/tokens';

const SHORTCUTS: [string, string][] = [
  ['N', 'Create a new habit'],
  ['1', 'Dashboard'],
  ['2', 'Analytics'],
  ['3', 'Settings'],
  ['Tab / Shift+Tab', 'Move between controls'],
  ['Enter / Space', 'Activate focused control (toggle a habit)'],
  ['← / →', 'Previous / next day on the dashboard'],
  ['T', 'Jump back to today on the dashboard'],
  ['?', 'Toggle this help'],
];

export function ShortcutHelp({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close shortcuts"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: space.lg }}
      >
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 440 }}>
          <Card style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T variant="heading">Keyboard shortcuts</T>
              <IconButton icon="close" label="Close" onPress={onClose} />
            </View>
            {SHORTCUTS.map(([key, desc]) => (
              <View key={key} style={{ flexDirection: 'row', gap: space.md }}>
                <T variant="label" style={{ width: 130 }}>{key}</T>
                <T tone="secondary" style={{ flex: 1 }}>{desc}</T>
              </View>
            ))}
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
