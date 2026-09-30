import type { Habit } from '@/types/habit';

// Local scheduled notifications are a mobile feature; on web these are no-ops
// so the rest of the app can call them unconditionally.
export const notificationsSupported = false;

export async function configureNotifications(): Promise<void> {}

export async function ensurePermission(): Promise<boolean> {
  return false;
}

export async function syncReminders(_habits: Habit[], _enabled: boolean): Promise<void> {}

export function addReminderResponseListener(_onOpen: (habitId: string) => void): () => void {
  return () => {};
}
