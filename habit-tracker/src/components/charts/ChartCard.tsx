import { type ReactNode, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, IconButton, T } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { space } from '@/theme/tokens';

/**
 * Frame for every chart: title, a live readout for the hovered/pressed mark,
 * and a table view (the accessible alternative to the plot).
 */
export function ChartCard({
  title,
  subtitle,
  readout,
  table,
  children,
}: {
  title: string;
  subtitle?: string;
  readout?: string | null;
  table?: { columns: [string, string]; rows: [string, string][] };
  children: ReactNode;
}) {
  const t = useTheme();
  const [showTable, setShowTable] = useState(false);
  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <T variant="heading">{title}</T>
          {subtitle ? <T variant="caption" tone="secondary">{subtitle}</T> : null}
        </View>
        {table && (
          <IconButton
            icon={showTable ? 'bar-chart-outline' : 'list-outline'}
            label={showTable ? 'Show chart' : 'Show data table'}
            size={18}
            color={t.textSecondary}
            onPress={() => setShowTable((v) => !v)}
          />
        )}
      </View>
      <T variant="label" tone={readout ? 'primary' : 'muted'} style={{ minHeight: 18 }}>
        {readout ?? 'Tap or drag on the chart for details'}
      </T>
      {showTable && table ? (
        <ScrollView style={{ maxHeight: 280 }}>
          <View style={[styles.tr, { borderBottomColor: t.axis }]}>
            <T variant="label" tone="secondary" style={{ flex: 1 }}>{table.columns[0]}</T>
            <T variant="label" tone="secondary">{table.columns[1]}</T>
          </View>
          {table.rows.map(([a, b], i) => (
            <View key={i} style={[styles.tr, { borderBottomColor: t.grid }]}>
              <T style={{ flex: 1 }}>{a}</T>
              <T style={{ fontVariant: ['tabular-nums'] }}>{b}</T>
            </View>
          ))}
        </ScrollView>
      ) : (
        children
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tr: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
});
