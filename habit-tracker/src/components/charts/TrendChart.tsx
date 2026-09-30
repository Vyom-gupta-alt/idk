import { useEffect, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, Platform, type PointerEvent, Text, View, type ViewStyle } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import type { SeriesPoint } from '@/lib/stats';
import { formatShort } from '@/lib/dates';
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth';
import { useTheme } from '@/hooks/useTheme';
import { ChartCard } from './ChartCard';
import { pct } from './format';

const Y_AXIS_WIDTH = 36;
const LABEL_WIDTH = 64;
const EDGE = 12;
// Stop mouse drags from selecting axis text on web.
const NO_SELECT = Platform.OS === 'web' ? ({ userSelect: 'none' } as ViewStyle) : null;

/** Completion % over time, with a drag/press crosshair that drives the readout. */
export function TrendChart({
  title,
  subtitle,
  points,
  color,
  bucketLabel = (k: string) => formatShort(k),
}: {
  title: string;
  subtitle?: string;
  points: SeriesPoint[];
  color?: string;
  bucketLabel?: (key: string) => string;
}) {
  const t = useTheme();
  const stroke = color ?? t.accent;
  const { width, onLayout } = useMeasuredWidth();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const spacingRef = useRef(0);

  const valid = useMemo(() => points.filter((p) => p.value != null), [points]);
  useEffect(() => setActiveIndex(null), [valid]);
  const active = activeIndex != null ? (valid[activeIndex] ?? null) : null;
  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH - 16);
  // As many date labels as fit without colliding.
  const labelEvery = Math.max(1, Math.ceil(valid.length / Math.max(2, Math.floor(plotWidth / (LABEL_WIDTH + 8)))));
  const data = useMemo(
    () =>
      valid.map((p, i) => ({
        value: Math.round((p.value ?? 0) * 100),
        dataPointRadius: i === activeIndex ? 6 : valid.length > 14 ? 0 : 3.5,
        dataPointColor: stroke,
        // The library sizes each label box to the point spacing, which truncates
        // dates on dense series — render a wider, centred box instead.
        labelComponent:
          i % labelEvery === 0
            ? () => (
                <View style={{ width: LABEL_WIDTH, marginLeft: (spacingRef.current - LABEL_WIDTH) / 2 }}>
                  <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: 10, textAlign: 'center' }}>
                    {bucketLabel(p.key)}
                  </Text>
                </View>
              )
            : undefined,
      })),
    [valid, labelEvery, bucketLabel, t.textMuted, activeIndex, stroke],
  );

  const spacing = data.length > 1 ? (plotWidth - 2 * EDGE) / (data.length - 1) : plotWidth;

  spacingRef.current = spacing;

  /** Map an x offset inside the chart to the nearest data index. */
  const pick = (x: number | undefined) => {
    if (x == null || !data.length) return;
    const i = Math.round((x - Y_AXIS_WIDTH - EDGE) / (spacing || 1));
    setActiveIndex(Math.max(0, Math.min(data.length - 1, i)));
  };
  const xOf = (e: GestureResponderEvent | PointerEvent) =>
    (e.nativeEvent as { locationX?: number; offsetX?: number }).locationX ??
    (e.nativeEvent as { offsetX?: number }).offsetX;

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      readout={active ? `${bucketLabel(active.key)} — ${pct(active.value)} (${active.done}/${active.scheduled})` : null}
      table={{
        columns: ['Period', 'Completion'],
        rows: valid.map((p) => [bucketLabel(p.key), `${pct(p.value)} (${p.done}/${p.scheduled})`]),
      }}
    >
      <View onLayout={onLayout} style={[{ minHeight: 200 }, NO_SELECT]}>
        {width > 0 && data.length > 0 && (
          <LineChart
            key={`${width}-${data.length}`}
            data={data}
            width={plotWidth}
            height={180}
            maxValue={100}
            noOfSections={4}
            yAxisLabelSuffix="%"
            yAxisLabelWidth={Y_AXIS_WIDTH}
            initialSpacing={EDGE}
            endSpacing={EDGE}
            spacing={spacing}
            disableScroll
            areaChart
            color={stroke}
            thickness={2}
            startFillColor={stroke}
            endFillColor={stroke}
            startOpacity={0.22}
            endOpacity={0.02}
            rulesColor={t.grid}
            rulesType="solid"
            yAxisColor="transparent"
            xAxisColor={t.axis}
            yAxisTextStyle={{ color: t.textMuted, fontSize: 11 }}
          />
        )}
        {width > 0 && data.length > 0 && (
          // Interaction layer: hover (desktop) and press/drag (touch) both drive the crosshair.
          <View
            accessible={false}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 190 }}
            onPointerMove={(e) => pick(xOf(e))}
            onPointerLeave={() => setActiveIndex(null)}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => pick(xOf(e))}
            onResponderMove={(e) => pick(xOf(e))}
            onResponderTerminationRequest={() => false}
          >
            {activeIndex != null && (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 8,
                  bottom: 0,
                  left: Y_AXIS_WIDTH + EDGE + activeIndex * spacing,
                  width: 1,
                  backgroundColor: t.axis,
                }}
              />
            )}
          </View>
        )}
      </View>
    </ChartCard>
  );
}
