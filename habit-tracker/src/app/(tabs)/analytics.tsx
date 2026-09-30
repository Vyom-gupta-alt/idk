import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useHabitStore } from '@/store/habitStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useResponsive } from '@/hooks/useResponsive';
import { useTheme } from '@/hooks/useTheme';
import { useToday } from '@/hooks/useToday';
import { formatShort, lastNDays } from '@/lib/dates';
import { completionRate, currentStreak, dailySeries, longestStreak, settled, weekdayRates, weeklySeries } from '@/lib/stats';
import { EmptyState, Button, Grid, Screen, ScreenHeader, Segmented, StatTile, T, Touchable } from '@/components/ui';
import { TrendChart } from '@/components/charts/TrendChart';
import { WeekdayChart } from '@/components/charts/WeekdayChart';
import { HabitRateBars } from '@/components/charts/HabitRateBars';
import { Heatmap } from '@/components/charts/Heatmap';
import { pct } from '@/components/charts/format';
import { habitColor } from '@/theme/palette';
import { radius, space } from '@/theme/tokens';

type Range = 7 | 30 | 90;
const RANGES: { value: Range; label: string }[] = [
  { value: 7, label: 'Week' },
  { value: 30, label: 'Month' },
  { value: 90, label: '3 months' },
];

export default function Analytics() {
  const t = useTheme();
  const today = useToday();
  const { breakpoint } = useResponsive();
  const [range, setRange] = useState<Range>(30);
  const [habitFilter, setHabitFilter] = useState<string | null>(null);

  const allHabits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);

  const habits = useMemo(() => allHabits.filter((h) => !h.archived).sort((a, b) => a.order - b.order), [allHabits]);
  const focusHabit = habits.find((h) => h.id === habitFilter) ?? null;
  const scope = focusHabit ? [focusHabit] : habits;

  const days = useMemo(() => lastNDays(today, range), [today, range]);
  const stats = useMemo(() => {
    const daily = dailySeries(scope, logs, days);
    // Don't let an in-progress today drag the trend down.
    const settledDays = settled(daily, today);
    const trend = range === 90 ? weeklySeries(settledDays, weekStartsOn) : settledDays;
    const perHabit = scope.map((habit) => ({
      habit,
      rate: completionRate(habit, logs, days, today),
      streak: currentStreak(habit, logs, today),
      longest: longestStreak(habit, logs, today),
    }));
    const done = perHabit.reduce((n, x) => n + x.rate.done, 0);
    const scheduled = perHabit.reduce((n, x) => n + x.rate.scheduled, 0);
    const perfect = settledDays.filter((p) => p.scheduled > 0 && p.done === p.scheduled).length;
    return {
      trend,
      perHabit,
      overall: scheduled ? done / scheduled : null,
      done,
      perfect,
      bestStreak: Math.max(0, ...perHabit.map((x) => x.streak)),
      longest: Math.max(0, ...perHabit.map((x) => x.longest)),
      weekday: weekdayRates(scope, logs, days, today),
      heat: dailySeries(scope, logs, lastNDays(today, 7 * 13)),
    };
  }, [scope, logs, days, today, range, weekStartsOn]);

  if (habits.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="Analytics" />
        <EmptyState
          icon="stats-chart-outline"
          title="No data yet"
          body="Charts appear once you've added habits and logged a few days. You can load sample data from Settings."
          action={<Button label="Go to settings" variant="secondary" onPress={() => router.navigate('/settings')} />}
        />
      </Screen>
    );
  }

  const wide = breakpoint !== 'compact';
  const rangeLabel = RANGES.find((r) => r.value === range)!.label.toLowerCase();

  return (
    <Screen>
      <ScreenHeader title="Analytics" subtitle={`${focusHabit ? focusHabit.name : 'All habits'} · last ${range} days`} />

      {/* Filters live in one row above the charts. */}
      <View style={{ gap: space.sm }}>
        <Segmented label="Time range" value={range} options={RANGES} onChange={setRange} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          <FilterChip label="All habits" active={!focusHabit} onPress={() => setHabitFilter(null)} color={t.accent} />
          {habits.map((h) => (
            <FilterChip
              key={h.id}
              label={h.name}
              active={focusHabit?.id === h.id}
              color={habitColor(h.color, t.scheme)}
              onPress={() => setHabitFilter(h.id)}
            />
          ))}
        </ScrollView>
      </View>

      <Grid columns={breakpoint === 'compact' ? 2 : 4} gap={space.md}>
        {[
          <StatTile key="rate" icon="pie-chart-outline" label="Completion" value={pct(stats.overall)} hint={`This ${rangeLabel}`} />,
          <StatTile key="streak" icon="flame-outline" label="Current streak" value={`${stats.bestStreak}d`} hint={`Longest ever ${stats.longest}d`} />,
          <StatTile key="perfect" icon="trophy-outline" label="Perfect days" value={String(stats.perfect)} hint="Every scheduled habit done" />,
          <StatTile key="done" icon="checkmark-done-outline" label="Check-ins" value={String(stats.done)} hint={`Of ${stats.perHabit.reduce((n, x) => n + x.rate.scheduled, 0)} scheduled`} />,
        ]}
      </Grid>

      <Grid columns={wide ? 2 : 1}>
        {[
          <TrendChart
            key="trend"
            title="Progress trend"
            subtitle={range === 90 ? 'Weekly completion rate' : 'Daily completion rate'}
            points={stats.trend}
            color={focusHabit ? habitColor(focusHabit.color, t.scheme) : undefined}
            bucketLabel={range === 90 ? (k) => `Wk of ${formatShort(k)}` : formatShort}
          />,
          focusHabit ? (
            <WeekdayChart key="weekday" rates={stats.weekday} weekStartsOn={weekStartsOn} />
          ) : (
            <HabitRateBars
              key="bars"
              items={stats.perHabit}
              onOpen={(id) => router.push({ pathname: '/habit/[id]', params: { id } })}
            />
          ),
          <Heatmap key="heat" points={stats.heat} weekStartsOn={weekStartsOn} />,
          focusHabit ? <StreakTable key="streaks" rows={stats.perHabit} /> : <WeekdayChart key="weekday" rates={stats.weekday} weekStartsOn={weekStartsOn} />,
        ]}
      </Grid>

      {!focusHabit && <StreakTable rows={stats.perHabit} />}
    </Screen>
  );
}

function FilterChip({ label, active, color, onPress }: { label: string; active: boolean; color: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Touchable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 36,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: active ? color : t.border,
        backgroundColor: active ? color + '1f' : t.surface,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <T variant="label" tone={active ? 'primary' : 'secondary'}>{label}</T>
    </Touchable>
  );
}

function StreakTable({ rows }: { rows: { habit: { id: string; name: string }; streak: number; longest: number; rate: { rate: number | null } }[] }) {
  const t = useTheme();
  const sorted = [...rows].sort((a, b) => b.streak - a.streak);
  return (
    <View style={{ backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, padding: space.lg, gap: space.sm }}>
      <T variant="heading">Streaks</T>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.axis, paddingBottom: 6 }}>
        <T variant="label" tone="secondary" style={{ flex: 1 }}>Habit</T>
        <T variant="label" tone="secondary" style={{ width: 80, textAlign: 'right' }}>Current</T>
        <T variant="label" tone="secondary" style={{ width: 80, textAlign: 'right' }}>Longest</T>
        <T variant="label" tone="secondary" style={{ width: 80, textAlign: 'right' }}>Rate</T>
      </View>
      {sorted.map((r) => (
        <Touchable
          key={r.habit.id}
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/habit/[id]', params: { id: r.habit.id } })}
          style={{ flexDirection: 'row', minHeight: 36, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: t.grid }}
        >
          <T style={{ flex: 1 }} numberOfLines={1}>{r.habit.name}</T>
          <T style={{ width: 80, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{r.streak}d</T>
          <T style={{ width: 80, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{r.longest}d</T>
          <T style={{ width: 80, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{pct(r.rate.rate)}</T>
        </Touchable>
      ))}
    </View>
  );
}
