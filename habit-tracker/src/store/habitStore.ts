import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DateKey, DayLog, Habit, HabitInput, HabitLogs } from '@/types/habit';
import { createId } from '@/lib/id';
import { todayKey } from '@/lib/dates';
import { buildDemoData } from '@/lib/demoData';
import { persistStorage } from './storage';

export interface HabitData {
  habits: Habit[];
  logs: HabitLogs;
}

interface HabitState extends HabitData {
  addHabit: (input: HabitInput) => string;
  updateHabit: (id: string, input: HabitInput) => void;
  deleteHabit: (id: string) => void;
  setArchived: (id: string, archived: boolean) => void;
  moveHabit: (id: string, direction: -1 | 1) => void;
  /** Mark a day done/undone. Completing checks every sub-task; undoing clears them. */
  toggleCompletion: (id: string, day: DateKey) => void;
  /** Toggle one sub-task. The day auto-completes when every sub-task is checked. */
  toggleSubtask: (id: string, subtaskId: string, day: DateKey) => void;
  setNote: (id: string, day: DateKey, note: string) => void;
  importData: (data: HabitData) => void;
  loadDemoData: () => void;
  resetAll: () => void;
}

const emptyLog = (): DayLog => ({ completed: false, subtasks: {} });

function withLog(logs: HabitLogs, id: string, day: DateKey, fn: (log: DayLog) => DayLog): HabitLogs {
  const habitLogs = logs[id] ?? {};
  return { ...logs, [id]: { ...habitLogs, [day]: fn(habitLogs[day] ?? emptyLog()) } };
}

export const useHabitStore = create<HabitState>()(
  persist(
    (set, get) => ({
      habits: [],
      logs: {},

      addHabit: (input) => {
        const id = createId();
        const order = Math.max(-1, ...get().habits.map((h) => h.order)) + 1;
        const habit: Habit = { ...input, id, createdAt: todayKey(), archived: false, order };
        set((s) => ({ habits: [...s.habits, habit] }));
        return id;
      },

      updateHabit: (id, input) =>
        set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, ...input } : h)) })),

      deleteHabit: (id) =>
        set((s) => {
          const { [id]: _removed, ...logs } = s.logs;
          return { habits: s.habits.filter((h) => h.id !== id), logs };
        }),

      setArchived: (id, archived) =>
        set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, archived } : h)) })),

      moveHabit: (id, direction) =>
        set((s) => {
          const sorted = [...s.habits].sort((a, b) => a.order - b.order);
          const i = sorted.findIndex((h) => h.id === id);
          const j = i + direction;
          if (i < 0 || j < 0 || j >= sorted.length) return s;
          [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
          return { habits: sorted.map((h, order) => ({ ...h, order })) };
        }),

      toggleCompletion: (id, day) => {
        const habit = get().habits.find((h) => h.id === id);
        if (!habit) return;
        set((s) => ({
          logs: withLog(s.logs, id, day, (log) => {
            const completed = !log.completed;
            const subtasks = Object.fromEntries(habit.subtasks.map((t) => [t.id, completed]));
            return { ...log, completed, subtasks };
          }),
        }));
      },

      toggleSubtask: (id, subtaskId, day) => {
        const habit = get().habits.find((h) => h.id === id);
        if (!habit) return;
        set((s) => ({
          logs: withLog(s.logs, id, day, (log) => {
            const subtasks = { ...log.subtasks, [subtaskId]: !log.subtasks[subtaskId] };
            const completed = habit.subtasks.length > 0 && habit.subtasks.every((t) => subtasks[t.id]);
            return { ...log, subtasks, completed };
          }),
        }));
      },

      setNote: (id, day, note) =>
        set((s) => ({ logs: withLog(s.logs, id, day, (log) => ({ ...log, note: note || undefined })) })),

      importData: ({ habits, logs }) => set({ habits, logs }),

      loadDemoData: () => set(buildDemoData(todayKey())),

      resetAll: () => set({ habits: [], logs: {} }),
    }),
    {
      name: 'habitual/habits',
      storage: persistStorage,
      version: 1,
      partialize: ({ habits, logs }) => ({ habits, logs }),
    },
  ),
);

