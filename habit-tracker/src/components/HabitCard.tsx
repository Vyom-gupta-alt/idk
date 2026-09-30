import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DateKey, DayLog, Habit } from '@/types/habit';
import { Card, CheckCircle, SmallCheckbox, T, Touchable } from '@/components/ui';
import { HabitIcon } from '@/components/HabitIcon';
import { useTheme } from '@/hooks/useTheme';
import { habitColor } from '@/theme/palette';
import { WEEKDAY_LETTER, weekdayOf } from '@/lib/dates';
import { space } from '@/theme/tokens';

export interface HabitCardProps {
  habit: Habit;
  day: DateKey;
  log: DayLog | undefined;
  streak: number;
  /** Last 7 days ending on `day`: true = done, false = missed, null = not scheduled. */
  recent: { key: DateKey; state: boolean | null }[];
  scheduled: boolean;
  defaultExpanded: boolean;
  onToggle: (id: string) => void;
  onToggleSubtask: (id: string, subtaskId: string) => void;
  onOpen: (id: string) => void;
}

export const HabitCard = memo(function HabitCard({
  habit,
  log,
  streak,
  recent,
  scheduled,
  defaultExpanded,
  onToggle,
  onToggleSubtask,
  onOpen,
}: HabitCardProps) {
  const t = useTheme();
  const color = habitColor(habit.color, t.scheme);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const done = log?.completed ?? false;
  const subDone = habit.subtasks.filter((s) => log?.subtasks[s.id]).length;
  const progress = habit.subtasks.length ? subDone / habit.subtasks.length : 0;

  return (
    <Card style={[styles.card, !scheduled && { opacity: 0.6 }]}>
      <View style={styles.row}>
        <Touchable
          accessibilityRole="link"
          accessibilityLabel={`Open ${habit.name}`}
          onPress={() => onOpen(habit.id)}
          style={styles.titleArea}
        >
          <HabitIcon icon={habit.icon} color={color} />
          <View style={{ flex: 1 }}>
            <T variant="heading" numberOfLines={1}>
              {habit.name}
            </T>
            <View style={styles.meta}>
              <Ionicons name="flame" size={13} color={streak > 0 ? '#eb6834' : t.textMuted} />
              <T variant="caption" tone="secondary">
                {streak} day streak
              </T>
              {!scheduled && (
                <T variant="caption" tone="muted">
                  · rest day
                </T>
              )}
            </View>
          </View>
        </Touchable>
        <CheckCircle
          checked={done}
          color={color}
          progress={progress}
          label={`${done ? 'Unmark' : 'Complete'} ${habit.name}`}
          onPress={() => onToggle(habit.id)}
        />
      </View>

      <View style={styles.recent} accessibilityLabel="Last 7 days">
        {recent.map(({ key, state }) => (
          <View key={key} style={{ alignItems: 'center', gap: 3, flex: 1 }}>
            <View
              style={[
                styles.dot,
                state === true && { backgroundColor: color },
                state === false && { backgroundColor: t.empty },
                state === null && { borderWidth: 1, borderColor: t.grid, borderStyle: 'dashed' },
              ]}
            />
            <T variant="caption" tone="muted" style={{ fontSize: 10 }}>
              {WEEKDAY_LETTER[weekdayOf(key)]}
            </T>
          </View>
        ))}
      </View>

      {habit.subtasks.length > 0 && (
        <View>
          <Touchable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((v) => !v)}
            style={styles.expander}
          >
            <T variant="label" tone="secondary">
              Checklist · {subDone}/{habit.subtasks.length}
            </T>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={t.textSecondary} />
          </Touchable>
          {expanded &&
            habit.subtasks.map((s) => (
              <SmallCheckbox
                key={s.id}
                label={s.title}
                color={color}
                checked={!!log?.subtasks[s.id]}
                onPress={() => onToggleSubtask(habit.id, s.id)}
              />
            ))}
        </View>
      )}
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  titleArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  recent: { flexDirection: 'row', gap: 4 },
  dot: { width: '100%', maxWidth: 28, height: 8, borderRadius: 4 },
  expander: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, borderRadius: 6 },
});
