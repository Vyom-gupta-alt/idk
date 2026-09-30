import { type ComponentProps, type ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  type TextProps,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useResponsive } from '@/hooks/useResponsive';
import { radius, space, TOUCH_TARGET } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** react-native-web adds `hovered` / `focused` to the Pressable state. */
type InteractionState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

interface TouchableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((s: InteractionState) => StyleProp<ViewStyle>);
}

/** Pressable with hover + visible keyboard-focus ring on web. */
export function Touchable({ style, ...rest }: TouchableProps) {
  const t = useTheme();
  return (
    <Pressable
      {...rest}
      style={(state) => {
        const s = state as InteractionState;
        return [
          typeof style === 'function' ? style(s) : style,
          s.hovered && { opacity: 0.88 },
          s.pressed && { opacity: 0.7 },
          s.focused && { outlineColor: t.accent, outlineWidth: 2, outlineStyle: 'solid' } as ViewStyle,
        ];
      }}
    />
  );
}

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption' | 'hero';

export function T({
  variant = 'body',
  tone = 'primary',
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: 'primary' | 'secondary' | 'muted' | 'accent' | 'danger' }) {
  const t = useTheme();
  const color = {
    primary: t.text,
    secondary: t.textSecondary,
    muted: t.textMuted,
    accent: t.accent,
    danger: t.danger,
  }[tone];
  return <Text {...rest} style={[textStyles[variant], { color }, style]} />;
}

const textStyles = StyleSheet.create({
  hero: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
});

/**
 * Scrollable page body. Pads for safe areas on mobile and caps line length on
 * wide screens so dashboards don't stretch edge to edge.
 */
export function Screen({
  children,
  maxWidth = 1280,
  scroll = true,
}: {
  children: ReactNode;
  maxWidth?: number;
  scroll?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();
  const pad = isWide ? space.xxl : space.lg;
  const inner = (
    <View style={{ width: '100%', maxWidth, alignSelf: 'center', gap: space.lg }}>{children}</View>
  );
  const padding = { paddingTop: (isWide ? pad : insets.top + space.md), paddingHorizontal: pad, paddingBottom: pad + 72 };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: t.bg }, padding]}>{inner}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={padding} keyboardShouldPersistTaps="handled">
      {inner}
    </ScrollView>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack && <IconButton icon="chevron-back" label="Back" onPress={onBack} />}
      <View style={{ flex: 1 }}>
        <T variant="title" numberOfLines={1} accessibilityRole="header">
          {title}
        </T>
        {subtitle ? <T tone="secondary">{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>{children}</View>
  );
}

export function Button({
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = { primary: t.accent, secondary: t.surfaceAlt, danger: t.danger, ghost: 'transparent' }[variant];
  const fg = variant === 'primary' || variant === 'danger' ? '#ffffff' : variant === 'ghost' ? t.accent : t.text;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, style]}
    >
      {icon && <Ionicons name={icon} size={18} color={fg} />}
      <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{label}</Text>
    </Touchable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  color,
  size = 22,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
}) {
  const t = useTheme();
  return (
    <Touchable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={styles.iconButton}>
      <Ionicons name={icon} size={size} color={color ?? t.text} />
    </Touchable>
  );
}

/** Round check control. `progress` (0‥1) draws a partial state for sub-tasks in progress. */
export function CheckCircle({
  checked,
  color,
  onPress,
  label,
  size = 36,
  progress = 0,
}: {
  checked: boolean;
  color: string;
  onPress: () => void;
  label: string;
  size?: number;
  progress?: number;
}) {
  const t = useTheme();
  return (
    <Touchable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={(TOUCH_TARGET - size) / 2 + 4}
      style={[
        styles.check,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: checked ? color : t.axis,
          backgroundColor: checked ? color : 'transparent',
        },
      ]}
    >
      {checked ? (
        <Ionicons name="checkmark" size={size * 0.6} color="#ffffff" />
      ) : progress > 0 ? (
        <T variant="caption" style={{ fontWeight: '700', color }}>
          {Math.round(progress * 100)}%
        </T>
      ) : null}
    </Touchable>
  );
}

export function SmallCheckbox({
  checked,
  color,
  onPress,
  label,
}: {
  checked: boolean;
  color: string;
  onPress: () => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <Touchable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.checkRow}
    >
      <View
        style={[
          styles.smallBox,
          { borderColor: checked ? color : t.axis, backgroundColor: checked ? color : 'transparent' },
        ]}
      >
        {checked && <Ionicons name="checkmark" size={14} color="#ffffff" />}
      </View>
      <T style={{ flex: 1, textDecorationLine: checked ? 'line-through' : 'none' }} tone={checked ? 'muted' : 'primary'}>
        {label}
      </T>
    </Touchable>
  );
}

export function Segmented<V extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segmented, { backgroundColor: t.surfaceAlt }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Touchable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: t.surface, borderColor: t.border }]}
          >
            <T variant="label" tone={active ? 'primary' : 'secondary'}>
              {o.label}
            </T>
          </Touchable>
        );
      })}
    </View>
  );
}

export function SettingRow({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1, minWidth: 180 }}>
        <T variant="heading">{title}</T>
        {subtitle ? <T variant="caption" tone="secondary">{subtitle}</T> : null}
      </View>
      {children}
    </View>
  );
}

export function Toggle({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      disabled={disabled}
      onValueChange={onChange}
      trackColor={{ true: t.accent, false: t.axis }}
      thumbColor="#ffffff"
    />
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: space.xxl, gap: space.sm }}>
      <Ionicons name={icon} size={40} color={t.textMuted} />
      <T variant="heading">{title}</T>
      <T tone="secondary" style={{ textAlign: 'center', maxWidth: 420 }}>
        {body}
      </T>
      {action}
    </Card>
  );
}

/** Lays children out in N equal columns (wraps to rows). */
export function Grid({ columns, children, gap = space.lg }: { columns: number; children: ReactNode[]; gap?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2, rowGap: gap }}>
      {children.map((child, i) => (
        <View key={i} style={{ width: `${100 / columns}%`, paddingHorizontal: gap / 2 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function StatTile({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: IconName }) {
  const t = useTheme();
  return (
    <Card style={{ gap: 2, flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon && <Ionicons name={icon} size={14} color={t.textSecondary} />}
        <T variant="label" tone="secondary">
          {label}
        </T>
      </View>
      <T variant="hero">{value}</T>
      {hint ? <T variant="caption" tone="muted">{hint}</T> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: TOUCH_TARGET },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
  button: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  check: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TOUCH_TARGET, borderRadius: radius.sm },
  smallBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: radius.md, alignSelf: 'flex-start' },
  segment: {
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  settingRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md, paddingVertical: space.sm },
});
