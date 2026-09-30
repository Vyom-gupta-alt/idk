/** 0 = Sunday … 6 = Saturday (matches `Date#getDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Local calendar day in `YYYY-MM-DD` form. */
export type DateKey = string;

export type Frequency =
  | { type: 'daily' }
  | { type: 'weekly'; days: Weekday[] };

export interface Subtask {
  id: string;
  title: string;
}

export interface Reminder {
  enabled: boolean;
  hour: number;
  minute: number;
}

export interface Habit {
  id: string;
  name: string;
  description: string;
  /** Ionicons glyph name. */
  icon: string;
  color: string;
  frequency: Frequency;
  subtasks: Subtask[];
  reminder: Reminder;
  createdAt: DateKey;
  archived: boolean;
  order: number;
}

export interface DayLog {
  completed: boolean;
  /** Checked state of each sub-task, keyed by `Subtask.id`. */
  subtasks: Record<string, boolean>;
  note?: string;
}

/** habitId → dateKey → log */
export type HabitLogs = Record<string, Record<DateKey, DayLog>>;

export type HabitInput = Pick<
  Habit,
  'name' | 'description' | 'icon' | 'color' | 'frequency' | 'reminder'
> & { subtasks: Subtask[] };

export type ThemePreference = 'system' | 'light' | 'dark';
