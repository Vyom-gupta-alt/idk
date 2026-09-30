import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { SeriesPoint } from '@/lib/stats';
import type { Weekday } from '@/types/habit';
import { T, Touchable } from '@/components/ui';
import { formatLong, orderedWeekdays, WEEKDAY_LETTER, weekdayOf } from '@/lib/dates';
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { useTheme } from '@/hooks/useTheme';
import { SEQUENTIAL_BLUE } from '@/theme/palette';
import { ChartCard } from './ChartCard';
import { pct } from './format';

const GAP = 3;

/** Contribution-style calendar: columns are weeks, rows are weekdays, shade = completion. */
export function Heatmap({ points, weekStartsOn }: { points: SeriesPoint[]; weekStartsOn: Weekday }) {
  const t = useTheme();
  const { width, onLayout } = useMeasuredWidth();
  const [active, setActive] = useState<SeriesPoint | null>(null);
  const order = orderedWeekdays(weekStartsOn);

  const weeks = useMemo(() => {
    const cols: (SeriesPoint | null)[][] = [];
    let col: (SeriesPoint | null)[] = [];
    const lead = order.indexOf(points.length ? weekdayOf(points[0].key) : weekStartsOn);
    for (let i = 0; i < lead; i++) col.push(null);
    for (const p of points) {
      col.push(p);
      if (col.length === 7) {
        cols.push(col);
        col = [];
      }
    }
    if (col.length) cols.push([...col, ...Array(7 - col.length).fill(null)]);
    return cols;
  }, [points, order, weekStartsOn]);

  const cell = width > 0 ? Math.min(22, Math.floor((width - 18 - GAP * weeks.length) / weeks.length)) : 0;
  // Light mode ramps light→dark; dark mode starts from the deeper steps so low values stay visible.
  const ramp = t.scheme === 'dark' ? [...SEQUENTIAL_BLUE].reverse() : SEQUENTIAL_BLUE;
  const shade = (v: number | null) => (v == null ? 'transparent' : v === 0 ? t.empty : ramp[Math.min(ramp.length - 1, Math.floor(v * (ramp.length - 1) + 0.5))]);

  return (
    <ChartCard
      title="Consistency heatmap"
      subtitle="Each square is a day — stronger colour means more habits completed"
      readout={active ? `${formatLong(active.key)} — ${pct(active.value)} (${active.done}/${active.scheduled})` : null}
    >
      <View onLayout={onLayout} style={{ flexDirection: 'row', gap: GAP }}>
        {cell > 0 && (
          <>
            <View style={{ gap: GAP, width: 14 }}>
              {order.map((d) => (
                <T key={d} variant="caption" tone="muted" style={{ height: cell, lineHeight: cell, fontSize: 9 }}>
                  {WEEKDAY_LETTER[d]}
                </T>
              ))}
            </View>
            {weeks.map((col, ci) => (
              <View key={ci} style={{ gap: GAP }}>
                {col.map((p, ri) =>
                  p ? (
                    <Touchable
                      key={p.key}
                      accessibilityLabel={`${formatLong(p.key)}: ${pct(p.value)}`}
                      onPress={() => setActive(p)}
                      onHoverIn={() => setActive(p)}
                      onFocus={() => setActive(p)}
                      style={{
                        width: cell,
                        height: cell,
                        borderRadius: 3,
                        backgroundColor: shade(p.value),
                        borderWidth: active?.key === p.key ? 2 : 0,
                        borderColor: t.text,
                      }}
                    />
                  ) : (
                    <View key={`e${ri}`} style={{ width: cell, height: cell }} />
                  ),
                )}
              </View>
            ))}
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' }}>
        <T variant="caption" tone="muted">Less</T>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <View key={v} style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: shade(v) }} />
        ))}
        <T variant="caption" tone="muted">More</T>
      </View>
    </ChartCard>
  );
}
