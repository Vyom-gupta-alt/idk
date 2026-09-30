import { Platform, useColorScheme } from 'react-native';
import { useSettingsStore } from '@/store/settingsStore';
import { darkTheme, lightTheme, type Theme } from '@/theme/tokens';

export function useTheme(): Theme {
  const system = useColorScheme();
  const pref = useSettingsStore((s) => s.theme);
  const scheme = pref === 'system' ? (hostTheme() ?? (system === 'dark' ? 'dark' : 'light')) : pref;
  return scheme === 'dark' ? darkTheme : lightTheme;
}

/** An explicit light/dark choice made by an embedding host (e.g. the Claude viewer). */
function hostTheme(): 'light' | 'dark' | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'dark' || t === 'light' ? t : null;
}
