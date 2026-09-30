/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Habit, HabitLogs } from '../../types/habit.ts';
import { addDaysKey, lastNDays } from '../dates.ts';
import {
  completionRate,
  currentStreak,
  dailySeries,
  isScheduled,
  longestStreak,
  weeklySeries,
} from '../stats.ts';

const TODAY = '2026-09-30'; // a Wednesday

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h1',
  name: 'Read',
  description: '',
  icon: 'book',
  color: '#2a78d6',
  frequency: { type: 'daily' },
  subtasks: [],
  reminder: { enabled: false, hour: 9, minute: 0 },
  createdAt: '2026-09-01',
  archived: false,
  order: 0,
  ...over,
});

const logsFor = (id: string, keys: string[]): HabitLogs => ({
  [id]: Object.fromEntries(keys.map((k) => [k, { completed: true, subtasks: {} }])),
});

test('current streak tolerates an unfinished today', () => {
  const logs = logsFor('h1', [addDaysKey(TODAY, -1), addDaysKey(TODAY, -2), addDaysKey(TODAY, -3)]);
  assert.equal(currentStreak(habit(), logs, TODAY), 3);
});

test('current streak counts today once completed and breaks on a miss', () => {
  const logs = logsFor('h1', [TODAY, addDaysKey(TODAY, -1), addDaysKey(TODAY, -3)]);
  assert.equal(currentStreak(habit(), logs, TODAY), 2);
});

test('weekly habits skip unscheduled days', () => {
  // Mon/Wed/Fri habit; Wed 30 and Mon 28 and Fri 25 done.
  const h = habit({ frequency: { type: 'weekly', days: [1, 3, 5] } });
  assert.equal(isScheduled(h, '2026-09-29'), false); // Tuesday
  const logs = logsFor('h1', ['2026-09-30', '2026-09-28', '2026-09-25']);
  assert.equal(currentStreak(h, logs, TODAY), 3);
});

test('longest streak finds the best run', () => {
  const logs = logsFor('h1', ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-10', '2026-09-11']);
  assert.equal(longestStreak(habit(), logs, TODAY), 3);
});

test('completion rate excludes an unfinished today and days before creation', () => {
  const h = habit({ createdAt: addDaysKey(TODAY, -3) });
  const logs = logsFor('h1', [addDaysKey(TODAY, -1), addDaysKey(TODAY, -2)]);
  const r = completionRate(h, logs, lastNDays(TODAY, 7), TODAY);
  assert.deepEqual(r, { done: 2, scheduled: 3, rate: 2 / 3 });
});

test('daily and weekly series aggregate across habits', () => {
  const a = habit({ id: 'a' });
  const b = habit({ id: 'b' });
  const logs = { ...logsFor('a', ['2026-09-28', '2026-09-29']), ...logsFor('b', ['2026-09-28']) };
  const daily = dailySeries([a, b], logs, ['2026-09-28', '2026-09-29']);
  assert.deepEqual(daily.map((p) => p.value), [1, 0.5]);
  const weekly = weeklySeries(daily, 1);
  assert.equal(weekly.length, 1);
  assert.equal(weekly[0].key, '2026-09-28');
  assert.equal(weekly[0].value, 3 / 4);
});
