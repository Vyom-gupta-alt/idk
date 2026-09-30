import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { Button, T, Touchable } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { radius, space } from '@/theme/tokens';
import { TABS } from './tabs';

/** Desktop / laptop / tablet navigation rail. */
export function Sidebar({ state, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;

  return (
    <View
      accessibilityRole="menu"
      style={[
        styles.sidebar,
        { backgroundColor: t.surface, borderRightColor: t.border, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg },
      ]}
    >
      <View style={styles.brand}>
        <View style={[styles.logo, { backgroundColor: t.accent }]}>
          <Ionicons name="checkmark-done" size={18} color="#fff" />
        </View>
        <T variant="heading" style={{ fontSize: 19 }}>Habitual</T>
      </View>

      <Button label="New habit" icon="add" onPress={() => router.push('/habit/new')} style={{ marginBottom: space.lg }} />

      <View style={{ gap: 2 }}>
        {TABS.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.name);
          if (!route) return null;
          const active = activeName === tab.name;
          return (
            <Touchable
              key={tab.name}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.title}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!active && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[styles.item, active && { backgroundColor: t.accentSoft }]}
            >
              <Ionicons name={active ? tab.iconActive : tab.icon} size={20} color={active ? (t.scheme === 'dark' ? '#fff' : t.accent) : t.textSecondary} />
              <T variant="label" style={{ flex: 1, fontSize: 15, color: active ? (t.scheme === 'dark' ? '#fff' : t.accent) : t.textSecondary }}>
                {tab.title}
              </T>
              {Platform.OS === 'web' && (
                <View style={[styles.kbd, { borderColor: t.border }]}>
                  <T variant="caption" tone="muted">{tab.shortcut}</T>
                </View>
              )}
            </Touchable>
          );
        })}
      </View>

      {Platform.OS === 'web' && (
        <View style={{ marginTop: 'auto', gap: 4 }}>
          <T variant="caption" tone="muted">Shortcuts</T>
          <T variant="caption" tone="muted">N — new habit · 1–3 — switch view · ? — help</T>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: 248, paddingHorizontal: space.lg, borderRightWidth: StyleSheet.hairlineWidth, height: '100%' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xl, paddingHorizontal: space.xs },
  logo: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  kbd: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6 },
});
