import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { IconName } from '@/components/ui';

export function HabitIcon({ icon, color, size = 40 }: { icon: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: color + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon as IconName} size={size * 0.52} color={color} />
    </View>
  );
}
