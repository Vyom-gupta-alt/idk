import { View } from 'react-native';
import type { DateKey, Weekday } from '@/types/habit';
import { T, Touchable } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { addDays, fromKey, startOfWeek, toKey, WEEKDAY_SHORT } from '@/lib/dates';
import { radius, space, TOUCH_TARGET } from '@/theme/tokens';

/** Current week; pick a day to log (future days are disabled). */
export function WeekStrip({
  selected,
  today,
  weekStartsOn,
  progressFor,
  onSelect,
}: {
  selected: DateKey;
  today: DateKey;
  weekStartsOn: Weekday;
  progressFor: (key: DateKey) => number | null;
  onSelect: (key: DateKey) => void;
}) {
  const t = useTheme();
  const start = startOfWeek(fromKey(selected), weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => toKey(addDays(start, i)));

  return (
    <View style={{ flexDirection: 'row', gap: space.xs }}>
      {days.map((key) => {
        const d = fromKey(key);
        const active = key === selected;
        const future = key > today;
        const p = progressFor(key);
        return (
          <Touchable
            key={key}
            disabled={future}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: future }}
            accessibilityLabel={`${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()}${p != null ? `, ${Math.round(p * 100)}% done` : ''}`}
            onPress={() => onSelect(key)}
            style={{
              flex: 1,
              minHeight: TOUCH_TARGET + 20,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              backgroundColor: active ? t.accent : t.surface,
              borderWidth: key === today && !active ? 1.5 : 0,
              borderColor: t.accent,
              opacity: future ? 0.4 : 1,
            }}
          >
            <T variant="caption" style={{ color: active ? '#fff' : t.textSecondary }}>
              {WEEKDAY_SHORT[d.getDay()]}
            </T>
            <T variant="heading" style={{ color: active ? '#fff' : t.text }}>
              {d.getDate()}
            </T>
            <View style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: active ? 'rgba(255,255,255,0.35)' : t.empty }}>
              <View
                style={{
                  width: `${Math.round((p ?? 0) * 100)}%`,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: active ? '#fff' : t.accent,
                }}
              />
            </View>
          </Touchable>
        );
      })}
    </View>
  );
}
