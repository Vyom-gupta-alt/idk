import { useState } from 'react';
import { View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import type { Rate } from '@/lib/stats';
import type { Weekday } from '@/types/habit';
import { orderedWeekdays, WEEKDAY_SHORT } from '@/lib/dates';
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { useTheme } from '@/hooks/useTheme';
import { ChartCard } from './ChartCard';
import { pct } from './format';

/** Which weekdays are strongest/weakest. Single hue; the pressed bar is emphasised. */
export function WeekdayChart({ rates, weekStartsOn }: { rates: Rate[]; weekStartsOn: Weekday }) {
  const t = useTheme();
  const { width, onLayout } = useMeasuredWidth();
  const [selected, setSelected] = useState<Weekday | null>(null);
  const days = orderedWeekdays(weekStartsOn);

  const plotWidth = Math.max(0, width - 52);
  const slot = plotWidth / 7;
  const barWidth = Math.min(36, slot * 0.6);

  const data = days.map((d) => ({
    value: Math.round((rates[d].rate ?? 0) * 100),
    label: WEEKDAY_SHORT[d],
    frontColor: selected == null || selected === d ? t.accent : t.accentSoft,
    onPress: () => setSelected((s) => (s === d ? null : d)),
  }));

  const r = selected != null ? rates[selected] : null;
  return (
    <ChartCard
      title="By weekday"
      subtitle="Completion rate for each day of the week"
      readout={r && selected != null ? `${WEEKDAY_SHORT[selected]} — ${pct(r.rate)} (${r.done}/${r.scheduled})` : null}
      table={{ columns: ['Day', 'Completion'], rows: days.map((d) => [WEEKDAY_SHORT[d], pct(rates[d].rate)]) }}
    >
      <View onLayout={onLayout} style={{ minHeight: 200 }}>
        {width > 0 && (
          <BarChart
            key={width}
            data={data}
            width={plotWidth}
            height={170}
            maxValue={100}
            noOfSections={4}
            yAxisLabelSuffix="%"
            yAxisLabelWidth={36}
            barWidth={barWidth}
            spacing={slot - barWidth}
            initialSpacing={(slot - barWidth) / 2}
            barBorderTopLeftRadius={4}
            barBorderTopRightRadius={4}
            disableScroll
            rulesColor={t.grid}
            rulesType="solid"
            yAxisColor="transparent"
            xAxisColor={t.axis}
            yAxisTextStyle={{ color: t.textMuted, fontSize: 11 }}
            xAxisLabelTextStyle={{ color: t.textMuted, fontSize: 11 }}
          />
        )}
      </View>
    </ChartCard>
  );
}
