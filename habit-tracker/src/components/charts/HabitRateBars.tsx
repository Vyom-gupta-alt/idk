import { useState } from 'react';
import { View } from 'react-native';
import type { Habit } from '@/types/habit';
import type { Rate } from '@/lib/stats';
import { T, Touchable } from '@/components/ui';
import { HabitIcon } from '@/components/HabitIcon';
import { useTheme } from '@/hooks/useTheme';
import { habitColor } from '@/theme/palette';
import { space } from '@/theme/tokens';
import { ChartCard } from './ChartCard';
import { pct } from './format';

/** Horizontal bars, one per habit, direct-labelled; colour follows the habit. */
export function HabitRateBars({
  items,
  onOpen,
}: {
  items: { habit: Habit; rate: Rate; streak: number }[];
  onOpen: (id: string) => void;
}) {
  const t = useTheme();
  const [active, setActive] = useState<string | null>(null);
  const a = items.find((i) => i.habit.id === active);

  return (
    <ChartCard
      title="Completion by habit"
      subtitle="Share of scheduled days completed in this period"
      readout={a ? `${a.habit.name} — ${pct(a.rate.rate)} · ${a.rate.done} of ${a.rate.scheduled} days · ${a.streak} day streak` : null}
      table={{ columns: ['Habit', 'Completion'], rows: items.map((i) => [i.habit.name, `${pct(i.rate.rate)} (${i.rate.done}/${i.rate.scheduled})`]) }}
    >
      <View style={{ gap: space.sm }}>
        {items.map(({ habit, rate }) => {
          const color = habitColor(habit.color, t.scheme);
          const value = rate.rate ?? 0;
          return (
            <Touchable
              key={habit.id}
              accessibilityRole="button"
              accessibilityLabel={`${habit.name}: ${pct(rate.rate)}. Open habit.`}
              onPress={() => onOpen(habit.id)}
              onHoverIn={() => setActive(habit.id)}
              onHoverOut={() => setActive((c) => (c === habit.id ? null : c))}
              onPressIn={() => setActive(habit.id)}
              onFocus={() => setActive(habit.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44, borderRadius: 8 }}
            >
              <HabitIcon icon={habit.icon} color={color} size={30} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T variant="label" numberOfLines={1} style={{ flex: 1 }}>{habit.name}</T>
                  <T variant="label" tone="secondary" style={{ fontVariant: ['tabular-nums'] }}>{pct(rate.rate)}</T>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: t.empty, overflow: 'hidden' }}>
                  <View style={{ width: `${value * 100}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
                </View>
              </View>
            </Touchable>
          );
        })}
      </View>
    </ChartCard>
  );
}
