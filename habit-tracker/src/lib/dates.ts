import type { DateKey, Weekday } from '../types/habit.ts';

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(now: Date = new Date()): DateKey {
  return toKey(now);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function addDaysKey(key: DateKey, days: number): DateKey {
  return toKey(addDays(fromKey(key), days));
}

/** Inclusive list of day keys from `start` to `end`. */
export function eachDay(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let d = fromKey(start); toKey(d) <= end; d = addDays(d, 1)) out.push(toKey(d));
  return out;
}

/** The `count` days ending at (and including) `end`, oldest first. */
export function lastNDays(end: DateKey, count: number): DateKey[] {
  return eachDay(addDaysKey(end, -(count - 1)), end);
}

export function startOfWeek(date: Date, weekStartsOn: Weekday): Date {
  const diff = (date.getDay() - weekStartsOn + 7) % 7;
  return addDays(date, -diff);
}

export function weekdayOf(key: DateKey): Weekday {
  return fromKey(key).getDay() as Weekday;
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Weekdays in display order for the chosen week start. */
export function orderedWeekdays(weekStartsOn: Weekday): Weekday[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as Weekday);
}

export function formatShort(key: DateKey): string {
  const d = fromKey(key);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function formatLong(key: DateKey): string {
  const d = fromKey(key);
  return `${WEEKDAY_SHORT[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function formatTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}`;
}
