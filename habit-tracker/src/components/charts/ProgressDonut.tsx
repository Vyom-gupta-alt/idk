import { View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { T } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

export function ProgressDonut({ done, total, size = 120, color }: { done: number; total: number; size?: number; color?: string }) {
  const t = useTheme();
  const fill = color ?? t.accent;
  const value = total === 0 ? 0 : done / total;
  const data =
    value >= 1
      ? [{ value: 1, color: fill }]
      : value <= 0
        ? [{ value: 1, color: t.empty }]
        : [
            { value, color: fill },
            { value: 1 - value, color: t.empty },
          ];
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: done }} accessibilityLabel={`${done} of ${total} habits done`}>
      <PieChart
        data={data}
        donut
        radius={size / 2}
        innerRadius={size / 2 - 12}
        innerCircleColor={t.surface}
        strokeWidth={data.length > 1 ? 2 : 0}
        strokeColor={t.surface}
        centerLabelComponent={() => (
          <View style={{ alignItems: 'center' }}>
            <T variant="title">{Math.round(value * 100)}%</T>
            <T variant="caption" tone="secondary">
              {done}/{total}
            </T>
          </View>
        )}
      />
    </View>
  );
}
