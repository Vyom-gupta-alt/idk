import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HabitInput, Subtask, Weekday } from '@/types/habit';
import { Button, Card, IconButton, type IconName, Segmented, SettingRow, T, Toggle, Touchable } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/store/settingsStore';
import { createId } from '@/lib/id';
import { formatTime, orderedWeekdays, WEEKDAY_SHORT } from '@/lib/dates';
import { notificationsSupported } from '@/lib/notifications';
import { HABIT_COLORS, HABIT_ICONS, habitColor } from '@/theme/palette';
import { radius, space, TOUCH_TARGET } from '@/theme/tokens';

export const EMPTY_HABIT: HabitInput = {
  name: '',
  description: '',
  icon: 'leaf',
  color: HABIT_COLORS[0].light,
  frequency: { type: 'daily' },
  subtasks: [],
  reminder: { enabled: false, hour: 9, minute: 0 },
};

export function HabitForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: HabitInput;
  submitLabel: string;
  onSubmit: (input: HabitInput) => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const [form, setForm] = useState<HabitInput>(initial);
  const [newSubtask, setNewSubtask] = useState('');
  const patch = (p: Partial<HabitInput>) => setForm((f) => ({ ...f, ...p }));

  const days: Weekday[] = form.frequency.type === 'weekly' ? form.frequency.days : [];
  const valid = form.name.trim().length > 0 && (form.frequency.type === 'daily' || days.length > 0);

  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    patch({ subtasks: [...form.subtasks, { id: createId(), title }] });
    setNewSubtask('');
  };
  const updateSubtask = (id: string, title: string) =>
    patch({ subtasks: form.subtasks.map((s) => (s.id === id ? { ...s, title } : s)) });
  const moveSubtask = (i: number, dir: -1 | 1) => {
    const next = [...form.subtasks];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    patch({ subtasks: next });
  };

  const submit = () => {
    if (!valid) return;
    onSubmit({
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
      subtasks: form.subtasks.filter((s: Subtask) => s.title.trim()),
    });
  };

  const inputStyle = [styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.surface }];
  const accent = habitColor(form.color, t.scheme);

  return (
    <View style={{ gap: space.lg }}>
      <Card style={{ gap: space.md }}>
        <Label text="Name" />
        <TextInput
          accessibilityLabel="Habit name"
          autoFocus={Platform.OS === 'web'}
          placeholder="e.g. Morning run"
          placeholderTextColor={t.textMuted}
          value={form.name}
          onChangeText={(name) => patch({ name })}
          onSubmitEditing={submit}
          returnKeyType="done"
          style={inputStyle}
        />
        <Label text="Description (optional)" />
        <TextInput
          accessibilityLabel="Description"
          placeholder="Why does this matter?"
          placeholderTextColor={t.textMuted}
          value={form.description}
          onChangeText={(description) => patch({ description })}
          style={inputStyle}
        />
      </Card>

      <Card style={{ gap: space.md }}>
        <Label text="Colour" />
        <View style={styles.wrap} accessibilityRole="radiogroup">
          {HABIT_COLORS.map((c) => {
            const active = form.color === c.light;
            return (
              <Touchable
                key={c.light}
                accessibilityRole="radio"
                accessibilityLabel={c.name}
                accessibilityState={{ selected: active }}
                onPress={() => patch({ color: c.light })}
                style={[styles.swatch, { backgroundColor: t.scheme === 'dark' ? c.dark : c.light, borderColor: active ? t.text : 'transparent' }]}
              >
                {active && <Ionicons name="checkmark" size={20} color="#fff" />}
              </Touchable>
            );
          })}
        </View>
        <Label text="Icon" />
        <View style={styles.wrap} accessibilityRole="radiogroup">
          {HABIT_ICONS.map((icon) => {
            const active = form.icon === icon;
            return (
              <Touchable
                key={icon}
                accessibilityRole="radio"
                accessibilityLabel={icon}
                accessibilityState={{ selected: active }}
                onPress={() => patch({ icon })}
                style={[styles.iconChoice, { backgroundColor: active ? accent + '26' : t.surfaceAlt, borderColor: active ? accent : 'transparent' }]}
              >
                <Ionicons name={icon as IconName} size={22} color={active ? accent : t.textSecondary} />
              </Touchable>
            );
          })}
        </View>
      </Card>

      <Card style={{ gap: space.md }}>
        <Label text="Frequency" />
        <Segmented
          label="Frequency"
          value={form.frequency.type}
          options={[
            { value: 'daily', label: 'Every day' },
            { value: 'weekly', label: 'Specific days' },
          ]}
          onChange={(type) =>
            patch({ frequency: type === 'daily' ? { type } : { type, days: days.length ? days : [1, 3, 5] } })
          }
        />
        {form.frequency.type === 'weekly' && (
          <View style={styles.wrap}>
            {orderedWeekdays(weekStartsOn).map((d) => {
              const on = days.includes(d);
              return (
                <Touchable
                  key={d}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={WEEKDAY_SHORT[d]}
                  onPress={() =>
                    patch({
                      frequency: { type: 'weekly', days: on ? days.filter((x) => x !== d) : [...days, d].sort() },
                    })
                  }
                  style={[styles.dayChip, { backgroundColor: on ? accent : t.surfaceAlt }]}
                >
                  <T variant="label" style={{ color: on ? '#fff' : t.textSecondary }}>
                    {WEEKDAY_SHORT[d]}
                  </T>
                </Touchable>
              );
            })}
          </View>
        )}
        {form.frequency.type === 'weekly' && days.length === 0 && (
          <T variant="caption" tone="danger">Pick at least one day.</T>
        )}
      </Card>

      <Card style={{ gap: space.sm }}>
        <Label text="Checklist (optional)" />
        <T variant="caption" tone="secondary">
          Break the habit into steps. Checking every step completes the habit for the day.
        </T>
        {form.subtasks.map((s, i) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <TextInput
              accessibilityLabel={`Step ${i + 1}`}
              value={s.title}
              onChangeText={(title) => updateSubtask(s.id, title)}
              style={[inputStyle, { flex: 1 }]}
            />
            <IconButton icon="arrow-up" label="Move step up" size={18} onPress={() => moveSubtask(i, -1)} />
            <IconButton icon="arrow-down" label="Move step down" size={18} onPress={() => moveSubtask(i, 1)} />
            <IconButton
              icon="close"
              label="Remove step"
              size={18}
              color={t.danger}
              onPress={() => patch({ subtasks: form.subtasks.filter((x) => x.id !== s.id) })}
            />
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <TextInput
            accessibilityLabel="New step"
            placeholder="Add a step and press Enter"
            placeholderTextColor={t.textMuted}
            value={newSubtask}
            onChangeText={setNewSubtask}
            onSubmitEditing={addSubtask}
            submitBehavior="submit"
            returnKeyType="done"
            style={[inputStyle, { flex: 1 }]}
          />
          <Button label="Add" icon="add" variant="secondary" onPress={addSubtask} disabled={!newSubtask.trim()} />
        </View>
      </Card>

      <Card style={{ gap: space.sm }}>
        <SettingRow
          title="Daily reminder"
          subtitle={notificationsSupported ? 'A local notification on the days this habit is scheduled.' : 'Reminders are delivered on the iOS and Android apps.'}
        >
          <Toggle
            label="Daily reminder"
            value={form.reminder.enabled}
            onChange={(enabled) => patch({ reminder: { ...form.reminder, enabled } })}
          />
        </SettingRow>
        {form.reminder.enabled && (
          <TimeStepper
            hour={form.reminder.hour}
            minute={form.reminder.minute}
            onChange={(hour, minute) => patch({ reminder: { ...form.reminder, hour, minute } })}
          />
        )}
      </Card>

      <View style={{ flexDirection: 'row', gap: space.md, justifyContent: 'flex-end' }}>
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
        <Button label={submitLabel} icon="checkmark" onPress={submit} disabled={!valid} />
      </View>
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <T variant="label" tone="secondary">{text}</T>;
}

/** Dependency-free time picker: works identically on touch and keyboard. */
function TimeStepper({ hour, minute, onChange }: { hour: number; minute: number; onChange: (h: number, m: number) => void }) {
  const t = useTheme();
  const step = (dh: number, dm: number) => {
    let total = (hour * 60 + minute + dh * 60 + dm + 24 * 60) % (24 * 60);
    total = Math.round(total / 5) * 5 % (24 * 60);
    onChange(Math.floor(total / 60), total % 60);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
      <IconButton icon="remove" label="One hour earlier" onPress={() => step(-1, 0)} />
      <IconButton icon="chevron-back" label="Five minutes earlier" onPress={() => step(0, -5)} />
      <View style={{ minWidth: 110, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: t.surfaceAlt }}>
        <T variant="title" accessibilityLiveRegion="polite">{formatTime(hour, minute)}</T>
      </View>
      <IconButton icon="chevron-forward" label="Five minutes later" onPress={() => step(0, 5)} />
      <IconButton icon="add" label="One hour later" onPress={() => step(1, 0)} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: TOUCH_TARGET, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 15 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: TOUCH_TARGET / 2, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  iconChoice: { width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: radius.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dayChip: { minWidth: 52, minHeight: TOUCH_TARGET, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
