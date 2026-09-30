import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DateKey, Habit, HabitLogs, Weekday } from '@/types/habit';
import { Card, IconButton, T, Touchable } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { addDays, orderedWeekdays, startOfWeek, toKey, WEEKDAY_LETTER } from '@/lib/dates';
import { isDone, isScheduled } from '@/lib/stats';
import { habitColor } from '@/theme/palette';
import { space } from '@/theme/tokens';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Month grid for one habit. Tap a past scheduled day to back-fill or undo it. */
export function MonthCalendar({
  habit,
  logs,
  today,
  weekStartsOn,
  onToggle,
}: {
  habit: Habit;
  logs: HabitLogs;
  today: DateKey;
  weekStartsOn: Weekday;
  onToggle: (day: DateKey) => void;
}) {
  const t = useTheme();
  const color = habitColor(habit.color, t.scheme);
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const first = new Date(cursor.y, cursor.m, 1);
  const gridStart = startOfWeek(first, weekStartsOn);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const rows = Array.from({ length: 6 }, (_, r) => cells.slice(r * 7, r * 7 + 7)).filter((row) =>
    row.some((d) => d.getMonth() === cursor.m),
  );
  const shift = (delta: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const isCurrentMonth = cursor.y === now.getFullYear() && cursor.m === now.getMonth();

  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T variant="heading" style={{ flex: 1 }}>
          {MONTHS[cursor.m]} {cursor.y}
        </T>
        <IconButton icon="chevron-back" label="Previous month" onPress={() => shift(-1)} />
        <IconButton icon="chevron-forward" label="Next month" onPress={() => !isCurrentMonth && shift(1)} color={isCurrentMonth ? t.axis : undefined} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        {orderedWeekdays(weekStartsOn).map((d) => (
          <T key={d} variant="caption" tone="muted" style={{ flex: 1, textAlign: 'center' }}>
            {WEEKDAY_LETTER[d]}
          </T>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row' }}>
          {row.map((d) => {
            const key = toKey(d);
            const inMonth = d.getMonth() === cursor.m;
            const scheduled = isScheduled(habit, key);
            const done = isDone(logs, habit.id, key);
            const editable = inMonth && scheduled && key <= today;
            return (
              <View key={key} style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }}>
                <Touchable
                  disabled={!editable}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done, disabled: !editable }}
                  accessibilityLabel={`${MONTHS[d.getMonth()]} ${d.getDate()}${done ? ', done' : ''}`}
                  onPress={() => onToggle(key)}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: done && inMonth ? color : 'transparent',
                    borderWidth: key === today ? 1.5 : 0,
                    borderColor: color,
                    opacity: inMonth ? (scheduled || done ? 1 : 0.35) : 0,
                  }}
                >
                  {done && inMonth ? (
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  ) : (
                    <T variant="label" tone={key > today ? 'muted' : 'primary'}>{d.getDate()}</T>
                  )}
                </Touchable>
              </View>
            );
          })}
        </View>
      ))}
    </Card>
  );
}
