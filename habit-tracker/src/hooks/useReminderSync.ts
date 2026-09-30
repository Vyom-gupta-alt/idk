import { useEffect, useMemo } from 'react';
import { router } from 'expo-router';
import { useHabitStore } from '@/store/habitStore';
import { useSettingsStore } from '@/store/settingsStore';
import { addReminderResponseListener, configureNotifications, syncReminders } from '@/lib/notifications';

/**
 * Keeps OS-scheduled reminders in step with the store. Reschedules only when
 * something reminder-relevant changes (not on every completion toggle).
 */
export function useReminderSync(ready: boolean): void {
  const habits = useHabitStore((s) => s.habits);
  const enabled = useSettingsStore((s) => s.notificationsEnabled);

  const signature = useMemo(
    () =>
      JSON.stringify(
        habits.map((h) => [h.id, h.name, h.archived, h.reminder, h.frequency, h.subtasks.length]),
      ),
    [habits],
  );

  useEffect(() => {
    configureNotifications().catch(console.warn);
    return addReminderResponseListener((id) => router.push({ pathname: '/habit/[id]', params: { id } }));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      syncReminders(useHabitStore.getState().habits, enabled).catch(console.warn);
    }, 400);
    return () => clearTimeout(timer);
  }, [ready, signature, enabled]);
}
