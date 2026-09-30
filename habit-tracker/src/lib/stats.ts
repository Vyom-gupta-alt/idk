import type { DateKey, Habit, HabitLogs } from '../types/habit.ts';
import { addDaysKey, eachDay, fromKey, startOfWeek, toKey, weekdayOf } from './dates.ts';
import type { Weekday } from '../types/habit.ts';

export function isScheduled(habit: Habit, key: DateKey): boolean {
  if (key < habit.createdAt) return false;
  if (habit.frequency.type === 'daily') return true;
  return habit.frequency.days.includes(weekdayOf(key));
}

export function isDone(logs: HabitLogs, habitId: string, key: DateKey): boolean {
  return logs[habitId]?.[key]?.completed === true;
}

/**
 * Consecutive scheduled days completed, ending today. An unfinished *today*
 * does not break the streak — the day isn't over yet.
 */
export function currentStreak(habit: Habit, logs: HabitLogs, today: DateKey): number {
  let streak = 0;
  let key = today;
  if (isScheduled(habit, key) && !isDone(logs, habit.id, key)) key = addDaysKey(key, -1);
  while (key >= habit.createdAt) {
    if (isScheduled(habit, key)) {
      if (!isDone(logs, habit.id, key)) break;
      streak++;
    }
    key = addDaysKey(key, -1);
  }
  return streak;
}

export function longestStreak(habit: Habit, logs: HabitLogs, today: DateKey): number {
  let best = 0;
  let run = 0;
  for (const key of eachDay(habit.createdAt, today)) {
    if (!isScheduled(habit, key)) continue;
    if (isDone(logs, habit.id, key)) {
      run++;
      best = Math.max(best, run);
    } else if (key !== today) {
      run = 0;
    }
  }
  return best;
}

export interface Rate {
  done: number;
  scheduled: number;
  /** 0‥1, or `null` when nothing was scheduled. */
  rate: number | null;
}

const rateOf = (done: number, scheduled: number): Rate => ({
  done,
  scheduled,
  rate: scheduled === 0 ? null : done / scheduled,
});

/** Completion rate over `days`. An unfinished `today` is left out of the denominator. */
export function completionRate(habit: Habit, logs: HabitLogs, days: DateKey[], today: DateKey): Rate {
  let done = 0;
  let scheduled = 0;
  for (const key of days) {
    if (!isScheduled(habit, key)) continue;
    const completed = isDone(logs, habit.id, key);
    if (key === today && !completed) continue;
    scheduled++;
    if (completed) done++;
  }
  return rateOf(done, scheduled);
}

export function dayProgress(habits: Habit[], logs: HabitLogs, key: DateKey): Rate {
  const due = habits.filter((h) => isScheduled(h, key));
  return rateOf(due.filter((h) => isDone(logs, h.id, key)).length, due.length);
}

export interface SeriesPoint {
  key: DateKey;
  /** 0‥1, or `null` when no habit was scheduled. */
  value: number | null;
  done: number;
  scheduled: number;
}

/** Share of scheduled habits completed on each day. */
export function dailySeries(habits: Habit[], logs: HabitLogs, days: DateKey[]): SeriesPoint[] {
  return days.map((key) => {
    const r = dayProgress(habits, logs, key);
    return { key, value: r.rate, done: r.done, scheduled: r.scheduled };
  });
}

/** Collapse a daily series into week buckets (keyed by the week's first day). */
export function weeklySeries(daily: SeriesPoint[], weekStartsOn: Weekday): SeriesPoint[] {
  const buckets = new Map<DateKey, { done: number; scheduled: number }>();
  for (const p of daily) {
    const wk = toKey(startOfWeek(fromKey(p.key), weekStartsOn));
    const b = buckets.get(wk) ?? { done: 0, scheduled: 0 };
    b.done += p.done;
    b.scheduled += p.scheduled;
    buckets.set(wk, b);
  }
  return [...buckets.entries()].map(([key, b]) => ({
    key,
    done: b.done,
    scheduled: b.scheduled,
    value: b.scheduled === 0 ? null : b.done / b.scheduled,
  }));
}

/** Completion rate per weekday (index = `Date#getDay`). */
export function weekdayRates(habits: Habit[], logs: HabitLogs, days: DateKey[], today: DateKey): Rate[] {
  const acc = Array.from({ length: 7 }, () => ({ done: 0, scheduled: 0 }));
  for (const key of days) {
    const wd = weekdayOf(key);
    for (const h of habits) {
      if (!isScheduled(h, key)) continue;
      const completed = isDone(logs, h.id, key);
      if (key === today && !completed) continue;
      acc[wd].scheduled++;
      if (completed) acc[wd].done++;
    }
  }
  return acc.map((a) => rateOf(a.done, a.scheduled));
}

export function totalCompletions(logs: HabitLogs, habitIds: string[]): number {
  let n = 0;
  for (const id of habitIds) {
    for (const log of Object.values(logs[id] ?? {})) if (log.completed) n++;
  }
  return n;
}

/** Drop an unfinished `today` so an in-progress day doesn't read as a dip. */
export function settled(series: SeriesPoint[], today: DateKey): SeriesPoint[] {
  return series.filter((p) => p.key !== today || (p.scheduled > 0 && p.done === p.scheduled));
}
