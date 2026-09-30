import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemePreference, Weekday } from '@/types/habit';
import { persistStorage } from './storage';

interface SettingsState {
  theme: ThemePreference;
  weekStartsOn: Weekday;
  notificationsEnabled: boolean;
  setTheme: (theme: ThemePreference) => void;
  setWeekStartsOn: (day: Weekday) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      weekStartsOn: 1,
      notificationsEnabled: true,
      setTheme: (theme) => set({ theme }),
      setWeekStartsOn: (weekStartsOn) => set({ weekStartsOn }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
    }),
    { name: 'habitual/settings', storage: persistStorage, version: 1 },
  ),
);
