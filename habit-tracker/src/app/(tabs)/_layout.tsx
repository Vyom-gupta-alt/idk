import { Tabs } from 'expo-router/js-tabs';
import { BottomBar } from '@/components/navigation/BottomBar';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TABS } from '@/components/navigation/tabs';
import { useResponsive } from '@/hooks/useResponsive';
import { useTheme } from '@/hooks/useTheme';

/**
 * One navigator, two presentations: a left sidebar on wide screens and a
 * bottom tab bar on phones. Switching is live as the window is resized.
 */
export default function TabsLayout() {
  const { isWide } = useResponsive();
  const t = useTheme();
  return (
    <Tabs
      tabBar={(props) => (isWide ? <Sidebar {...props} /> : <BottomBar {...props} />)}
      screenOptions={{
        headerShown: false,
        tabBarPosition: isWide ? 'left' : 'bottom',
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}
