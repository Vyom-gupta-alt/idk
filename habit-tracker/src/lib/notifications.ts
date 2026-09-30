import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Habit } from '@/types/habit';

const CHANNEL_ID = 'habit-reminders';
const ID_PREFIX = 'habit-reminder:';

export const notificationsSupported = true;

/** Call once at startup: foreground presentation + Android channel. */
export async function configureNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Habit reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

/**
 * Replace every scheduled habit reminder with the given set. Daily habits get
 * one repeating DAILY trigger; weekly habits get one WEEKLY trigger per day.
 */
export async function syncReminders(habits: Habit[], enabled: boolean): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  const due = habits.filter((h) => !h.archived && h.reminder.enabled);
  if (!enabled || due.length === 0) return;
  if (!(await ensurePermission())) return;

  const channelId = Platform.OS === 'android' ? CHANNEL_ID : undefined;
  for (const habit of due) {
    const { hour, minute } = habit.reminder;
    const content: Notifications.NotificationContentInput = {
      title: habit.name,
      body: habit.subtasks.length
        ? `Time for your habit — ${habit.subtasks.length} step${habit.subtasks.length > 1 ? 's' : ''} to check off.`
        : 'Time to keep your streak going.',
      data: { habitId: habit.id, url: `/habit/${habit.id}` },
    };
    if (habit.frequency.type === 'daily') {
      await Notifications.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${habit.id}`,
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId },
      });
    } else {
      for (const day of habit.frequency.days) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${ID_PREFIX}${habit.id}:${day}`,
          content,
          // expo-notifications weekdays are 1 (Sunday) … 7 (Saturday).
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: day + 1,
            hour,
            minute,
            channelId,
          },
        });
      }
    }
  }
}

/** Invoke `onOpen` with the habit id when the user taps a reminder. */
export function addReminderResponseListener(onOpen: (habitId: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const habitId = response.notification.request.content.data?.habitId;
    if (typeof habitId === 'string') onOpen(habitId);
  });
  return () => sub.remove();
}
