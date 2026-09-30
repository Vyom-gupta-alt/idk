import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Touchable } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

/** Floating "new habit" button for phone layouts. */
export function Fab() {
  const t = useTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel="New habit"
      onPress={() => router.push('/habit/new')}
      style={{
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: t.accent,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <Ionicons name="add" size={30} color="#fff" />
    </Touchable>
  );
}
