import type { DateKey, Habit, HabitLogs } from '../types/habit.ts';
import { addDaysKey, eachDay, weekdayOf } from './dates.ts';
import { HABIT_COLORS } from '../theme/palette.ts';

/** Small deterministic PRNG so demo data looks the same every time. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample habits with ~90 days of plausible history, for trying out analytics. */
export function buildDemoData(today: DateKey): { habits: Habit[]; logs: HabitLogs } {
  const start = addDaysKey(today, -90);
  const base = { description: '', archived: false, createdAt: start };
  const habits: Habit[] = [
    {
      ...base, id: 'demo-read', name: 'Read 20 pages', icon: 'book', color: HABIT_COLORS[0].light,
      description: 'Any book counts.', frequency: { type: 'daily' }, order: 0,
      subtasks: [], reminder: { enabled: true, hour: 21, minute: 0 },
    },
    {
      ...base, id: 'demo-workout', name: 'Workout', icon: 'barbell', color: HABIT_COLORS[1].light,
      frequency: { type: 'weekly', days: [1, 3, 5] }, order: 1,
      subtasks: [
        { id: 'warmup', title: 'Warm up 10 min' },
        { id: 'strength', title: 'Strength block' },
        { id: 'stretch', title: 'Stretch' },
      ],
      reminder: { enabled: true, hour: 7, minute: 30 },
    },
    {
      ...base, id: 'demo-water', name: 'Drink 2L water', icon: 'water', color: HABIT_COLORS[2].light,
      frequency: { type: 'daily' }, order: 2, subtasks: [], reminder: { enabled: false, hour: 12, minute: 0 },
    },
    {
      ...base, id: 'demo-journal', name: 'Evening journal', icon: 'pencil', color: HABIT_COLORS[6].light,
      frequency: { type: 'daily' }, order: 3,
      subtasks: [
        { id: 'grateful', title: '3 things I\'m grateful for' },
        { id: 'tomorrow', title: 'Plan tomorrow' },
      ],
      reminder: { enabled: false, hour: 22, minute: 0 },
    },
  ];

  const rand = mulberry32(42);
  const baseChance: Record<string, number> = {
    'demo-read': 0.72, 'demo-workout': 0.8, 'demo-water': 0.6, 'demo-journal': 0.55,
  };
  const logs: HabitLogs = {};
  const days = eachDay(start, addDaysKey(today, -1));
  for (const h of habits) {
    logs[h.id] = {};
    days.forEach((key, i) => {
      if (h.frequency.type === 'weekly' && !h.frequency.days.includes(weekdayOf(key))) return;
      // Gentle upward trend so the charts have a story to tell.
      const chance = baseChance[h.id] + (i / days.length) * 0.2 - (weekdayOf(key) % 6 === 0 ? 0.15 : 0);
      if (rand() < chance) {
        logs[h.id][key] = {
          completed: true,
          subtasks: Object.fromEntries(h.subtasks.map((t) => [t.id, true])),
        };
      }
    });
  }
  return { habits, logs };
}
