import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

/** Dashboard → Habit detail stack, nested in the tabs so navigation chrome stays visible. */
export default function HomeLayout() {
  const t = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />;
}
