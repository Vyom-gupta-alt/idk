import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useHydration } from '@/hooks/useHydration';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useReminderSync } from '@/hooks/useReminderSync';
import { useTheme } from '@/hooks/useTheme';
import { ShortcutHelp } from '@/components/ShortcutHelp';
import { DialogHost } from '@/components/DialogHost';

export default function RootLayout() {
  const hydrated = useHydration();
  const t = useTheme();
  const [helpOpen, setHelpOpen] = useState(false);
  useReminderSync(hydrated);

  useKeyboardShortcuts(
    {
      n: () => router.push('/habit/new'),
      '1': () => router.navigate('/'),
      '2': () => router.navigate('/analytics'),
      '3': () => router.navigate('/settings'),
      '?': () => setHelpOpen((v) => !v),
      Escape: () => setHelpOpen(false),
    },
    hydrated,
  );

  return (
    <SafeAreaProvider>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      {hydrated ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="habit/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="habit/[id]/edit" options={{ presentation: 'modal' }} />
        </Stack>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
          <ActivityIndicator color={t.accent} />
        </View>
      )}
      <ShortcutHelp visible={helpOpen} onClose={() => setHelpOpen(false)} />
      <DialogHost />
    </SafeAreaProvider>
  );
}
