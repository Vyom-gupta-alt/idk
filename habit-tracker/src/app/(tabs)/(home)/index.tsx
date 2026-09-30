import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { useHabitStore } from '@/store/habitStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useResponsive } from '@/hooks/useResponsive';
import { useToday } from '@/hooks/useToday';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { addDaysKey, formatLong, lastNDays } from '@/lib/dates';
import { currentStreak, dailySeries, dayProgress, isDone, isScheduled, settled } from '@/lib/stats';
import { Button, Card, EmptyState, Grid, Screen, ScreenHeader, T } from '@/components/ui';
import { HabitCard } from '@/components/HabitCard';
import { WeekStrip } from '@/components/WeekStrip';
import { ProgressDonut } from '@/components/charts/ProgressDonut';
import { TrendChart } from '@/components/charts/TrendChart';
import { Fab } from '@/components/Fab';
import { space } from '@/theme/tokens';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const today = useToday();
  const { isWide, breakpoint } = useResponsive();
  const focused = useIsFocused();
  const [selectedDay, setSelectedDay] = useState(today);
  const day = selectedDay > today ? today : selectedDay;

  const allHabits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const toggleCompletion = useHabitStore((s) => s.toggleCompletion);
  const toggleSubtask = useHabitStore((s) => s.toggleSubtask);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);

  const habits = useMemo(
    () => allHabits.filter((h) => !h.archived).sort((a, b) => a.order - b.order),
    [allHabits],
  );
  // Scheduled habits first, rest days after.
  const ordered = useMemo(
    () => [...habits].sort((a, b) => Number(isScheduled(b, day)) - Number(isScheduled(a, day))),
    [habits, day],
  );
  const progress = dayProgress(habits, logs, day);
  const trend = useMemo(() => settled(dailySeries(habits, logs, lastNDays(today, 14)), today), [habits, logs, today]);

  const onToggle = useCallback((id: string) => toggleCompletion(id, day), [toggleCompletion, day]);
  const onToggleSubtask = useCallback((id: string, sub: string) => toggleSubtask(id, sub, day), [toggleSubtask, day]);
  const onOpen = useCallback((id: string) => router.push({ pathname: '/habit/[id]', params: { id } }), []);

  useKeyboardShortcuts(
    {
      ArrowLeft: () => setSelectedDay(addDaysKey(day, -1)),
      ArrowRight: () => setSelectedDay(day < today ? addDaysKey(day, 1) : today),
      t: () => setSelectedDay(today),
    },
    focused,
  );

  const cards = ordered.map((habit) => (
    <HabitCard
      key={habit.id}
      habit={habit}
      day={day}
      log={logs[habit.id]?.[day]}
      streak={currentStreak(habit, logs, today)}
      scheduled={isScheduled(habit, day)}
      recent={lastNDays(day, 7).map((key) => ({
        key,
        state: isScheduled(habit, key) ? isDone(logs, habit.id, key) : null,
      }))}
      defaultExpanded={isWide}
      onToggle={onToggle}
      onToggleSubtask={onToggleSubtask}
      onOpen={onOpen}
    />
  ));

  const summary = (
    <Card style={{ flexDirection: isWide ? 'column' : 'row', alignItems: 'center', gap: space.lg }}>
      <ProgressDonut done={progress.done} total={progress.scheduled} size={isWide ? 150 : 104} />
      <View style={{ flex: isWide ? undefined : 1, alignItems: isWide ? 'center' : 'flex-start', gap: 2 }}>
        <T variant="heading">{day === today ? "Today's progress" : formatLong(day)}</T>
        <T tone="secondary" style={{ textAlign: isWide ? 'center' : 'left' }}>
          {progress.scheduled === 0
            ? 'Nothing scheduled.'
            : progress.done === progress.scheduled
              ? 'Everything done — nice work!'
              : `${progress.scheduled - progress.done} habit${progress.scheduled - progress.done === 1 ? '' : 's'} left`}
        </T>
      </View>
    </Card>
  );

  const header = (
    <>
      <ScreenHeader
        title={greeting()}
        subtitle={formatLong(today)}
        right={isWide ? null : <Button label="Stats" icon="stats-chart" variant="secondary" onPress={() => router.navigate('/analytics')} />}
      />
      <WeekStrip
        selected={day}
        today={today}
        weekStartsOn={weekStartsOn}
        onSelect={setSelectedDay}
        progressFor={(key) => dayProgress(habits, logs, key).rate}
      />
    </>
  );

  if (habits.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <Screen>
          {header}
          <EmptyState
            icon="sparkles-outline"
            title="Start your first habit"
            body="Create a habit, add an optional checklist, and set a reminder. Or load sample data from Settings to explore the analytics."
            action={<Button label="Create habit" icon="add" onPress={() => router.push('/habit/new')} />}
          />
        </Screen>
        {!isWide && <Fab />}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        {header}
        {isWide ? (
          // Laptop/desktop: habit grid + a sticky-ish summary column.
          <View style={{ flexDirection: 'row', gap: space.xl, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Grid columns={breakpoint === 'expanded' ? 2 : 1}>{cards}</Grid>
            </View>
            <View style={{ width: breakpoint === 'expanded' ? 340 : 280, gap: space.lg }}>
              {summary}
              <TrendChart title="Last 14 days" subtitle="Daily completion rate" points={trend} />
            </View>
          </View>
        ) : (
          <>
            {summary}
            <View style={{ gap: space.md }}>{cards}</View>
          </>
        )}
      </Screen>
      {!isWide && <Fab />}
    </View>
  );
}
