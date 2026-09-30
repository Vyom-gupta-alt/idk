import { useColorScheme } from 'react-native';
import { useSettingsStore } from '@/store/settingsStore';
import { darkTheme, lightTheme, type Theme } from '@/theme/tokens';

export function useTheme(): Theme {
  const system = useColorScheme();
  const pref = useSettingsStore((s) => s.theme);
  const scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  return scheme === 'dark' ? darkTheme : lightTheme;
}
