import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, Touchable } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { TOUCH_TARGET } from '@/theme/tokens';
import { TABS } from './tabs';

/** Phone navigation: large, thumb-reachable targets above the home indicator. */
export function BottomBar({ state, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      {TABS.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        if (!route) return null;
        const active = activeName === tab.name;
        const color = active ? t.accent : t.textMuted;
        return (
          <Touchable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.title}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!active && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={styles.tab}
          >
            <Ionicons name={active ? tab.iconActive : tab.icon} size={24} color={color} />
            <T variant="caption" style={{ color, fontWeight: active ? '600' : '400' }}>
              {tab.title}
            </T>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tab: { flex: 1, minHeight: TOUCH_TARGET + 8, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
