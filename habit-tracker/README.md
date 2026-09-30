# Habitual — cross-platform habit tracker

An Expo (SDK 57) + React Native app that runs on **iOS, Android and the web/desktop** from one codebase.

## Features

- **Responsive layout.** Phones get a bottom tab bar, 44pt+ touch targets and a floating "new habit" button. At ≥ 768px wide (tablets, laptops, desktop browsers) the same navigator renders as a **sidebar**, and screens switch to multi-column dashboards. The layout changes live as the window is resized.
- **Keyboard-friendly on desktop.** `N` new habit · `1`/`2`/`3` switch views · `←`/`→` change day · `T` today · `?` shortcut help. Every control can be reached with Tab and shows a visible focus ring.
- **Habits and checklists.** Each habit has a name, icon, colour, schedule (every day or chosen weekdays), optional **sub-task checklist** and a reminder. Checking every sub-task completes the day automatically. You can back-fill past days from the week strip or the month calendar, and add a daily note.
- **Analytics.** Stat tiles, a progress-trend line with a hover/drag crosshair, completion by habit, a weekday breakdown and a 13-week heatmap. Filter by **week / month / 3 months** and by habit. Every chart can switch to a data-table view.
- **Local reminders.** `expo-notifications` schedules repeating DAILY and WEEKLY triggers for each habit. Tapping a reminder opens that habit.
- **Offline persistence.** Zustand stores are persisted with AsyncStorage. That's native storage on iOS and Android, and `localStorage` in the browser. Data survives restarts, and you can export or import it as a JSON backup.

## Getting started

```bash
cd habit-tracker
npm install
npm run web        # browser / desktop
npm run ios        # iOS simulator or Expo Go
npm run android    # Android emulator or Expo Go
```

Use **Settings → Load sample data** to fill the app with about 90 days of history, so the charts have something to show.

> Reminders are local notifications, so they only fire on iOS and Android. On web the reminder switches still save their settings, and scheduling becomes a no-op (`src/lib/notifications.web.ts`). For the most reliable notification behaviour on Android, use a [development build](https://docs.expo.dev/develop/development-builds/introduction/) rather than Expo Go.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests for streak and stats logic (Node's built-in test runner) |
| `npm run build:web` | Static web export to `dist/` |

## Project structure

```
src/
  app/                         Expo Router routes (file = screen)
    _layout.tsx                Root stack, store hydration gate, reminders, global shortcuts
    (tabs)/_layout.tsx         Responsive navigator: Sidebar (wide) ↔ BottomBar (phone)
    (tabs)/(home)/index.tsx    Dashboard
    (tabs)/(home)/habit/[id].tsx  Habit detail (inside tabs, so navigation stays visible)
    (tabs)/analytics.tsx       Analytics
    (tabs)/settings.tsx        Settings
    habit/new.tsx              Create habit (modal)
    habit/[id]/edit.tsx        Edit habit (modal)
  components/
    navigation/                Sidebar, BottomBar, tab definitions
    charts/                    TrendChart, WeekdayChart, HabitRateBars, Heatmap, ProgressDonut
    HabitCard, HabitForm, WeekStrip, MonthCalendar, ui.tsx (design-system primitives)
  store/
    habitStore.ts              Habits + logs, all mutations (persisted)
    settingsStore.ts           Theme, week start, notifications (persisted)
    storage.ts                 AsyncStorage adapter for zustand/persist
  lib/
    stats.ts                   Pure streak / completion / series maths (unit-tested)
    dates.ts                   Local-time date keys and helpers
    notifications(.web).ts     Platform-specific reminder scheduling
    backup.ts, demoData.ts, confirm.ts
  hooks/                       useResponsive, useTheme, useHydration, useReminderSync, useKeyboardShortcuts, …
  theme/                       Light/dark tokens and the colour-blind-safe habit palette
  types/habit.ts               Data model
```

## Data model

```ts
Habit   { id, name, description, icon, color, frequency, subtasks[], reminder, createdAt, archived, order }
HabitLogs = { [habitId]: { ['YYYY-MM-DD']: { completed, subtasks: { [subtaskId]: boolean }, note? } } }
```

Days are stored as **local** calendar keys, so a streak follows the user's own midnight. The rules for streaks and completion rates:

- A streak counts consecutive *scheduled* days. Unscheduled days are skipped.
- If today isn't done yet, the streak doesn't break. The day isn't over.
- Completion rates leave an unfinished today out of the total.
