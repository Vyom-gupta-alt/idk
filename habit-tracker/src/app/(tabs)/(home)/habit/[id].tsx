import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useHabitStore } from '@/store/habitStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useResponsive } from '@/hooks/useResponsive';
import { useTheme } from '@/hooks/useTheme';
import { useToday } from '@/hooks/useToday';
import { formatShort, formatTime, lastNDays, WEEKDAY_SHORT } from '@/lib/dates';
import { completionRate, currentStreak, dailySeries, isScheduled, longestStreak, settled, weeklySeries } from '@/lib/stats';
import { confirm } from '@/lib/confirm';
import { Button, Card, CheckCircle, EmptyState, Grid, IconButton, Screen, ScreenHeader, SmallCheckbox, StatTile, T } from '@/components/ui';
import { HabitIcon } from '@/components/HabitIcon';
import { MonthCalendar } from '@/components/MonthCalendar';
import { TrendChart } from '@/components/charts/TrendChart';
import { pct } from '@/components/charts/format';
import { habitColor } from '@/theme/palette';
import { radius, space } from '@/theme/tokens';

export default function HabitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const today = useToday();
  const { isWide, breakpoint } = useResponsive();
  const habit = useHabitStore((s) => s.habits.find((h) => h.id === id));
  const logs = useHabitStore((s) => s.logs);
  const { toggleCompletion, toggleSubtask, setNote, deleteHabit, setArchived } = useHabitStore.getState();
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);

  const stats = useMemo(() => {
    if (!habit) return null;
    const total = Object.values(logs[habit.id] ?? {}).filter((l) => l.completed).length;
    return {
      streak: currentStreak(habit, logs, today),
      longest: longestStreak(habit, logs, today),
      rate30: completionRate(habit, logs, lastNDays(today, 30), today),
      total,
      weekly: weeklySeries(settled(dailySeries([habit], logs, lastNDays(today, 12 * 7)), today), weekStartsOn).filter((p) => p.scheduled > 0),
    };
  }, [habit, logs, today, weekStartsOn]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!habit || !stats) {
    return (
      <Screen>
        <ScreenHeader title="Habit" onBack={goBack} />
        <EmptyState icon="help-circle-outline" title="Habit not found" body="It may have been deleted." />
      </Screen>
    );
  }

  const color = habitColor(habit.color, t.scheme);
  const log = logs[habit.id]?.[today];
  const scheduledToday = isScheduled(habit, today);
  const schedule =
    habit.frequency.type === 'daily' ? 'Every day' : habit.frequency.days.map((d) => WEEKDAY_SHORT[d]).join(', ');

  const onDelete = async () => {
    if (await confirm(`Delete “${habit.name}”?`, 'This removes the habit and its entire history.')) {
      deleteHabit(habit.id);
      goBack();
    }
  };

  const todayCard = (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <T variant="heading">Today</T>
          <T variant="caption" tone="secondary">
            {scheduledToday ? (log?.completed ? 'Completed — keep it up!' : 'Not done yet') : 'Rest day — not scheduled'}
          </T>
        </View>
        <CheckCircle
          size={48}
          checked={!!log?.completed}
          color={color}
          label={`${log?.completed ? 'Unmark' : 'Complete'} ${habit.name} for today`}
          onPress={() => toggleCompletion(habit.id, today)}
          progress={habit.subtasks.length ? habit.subtasks.filter((s) => log?.subtasks[s.id]).length / habit.subtasks.length : 0}
        />
      </View>
      {habit.subtasks.length > 0 && (
        <View>
          <T variant="label" tone="secondary">Checklist</T>
          {habit.subtasks.map((s) => (
            <SmallCheckbox
              key={s.id}
              label={s.title}
              color={color}
              checked={!!log?.subtasks[s.id]}
              onPress={() => toggleSubtask(habit.id, s.id, today)}
            />
          ))}
        </View>
      )}
      <NoteField
        key={`${habit.id}-${today}`}
        initial={log?.note ?? ''}
        onSave={(note) => setNote(habit.id, today, note)}
      />
    </Card>
  );

  const infoCard = (
    <Card style={{ gap: space.sm }}>
      <InfoRow icon="repeat" label="Schedule" value={schedule} />
      <InfoRow
        icon="alarm-outline"
        label="Reminder"
        value={habit.reminder.enabled ? formatTime(habit.reminder.hour, habit.reminder.minute) : 'Off'}
      />
      <InfoRow icon="calendar-outline" label="Started" value={formatShort(habit.createdAt)} />
    </Card>
  );

  return (
    <Screen>
      <ScreenHeader
        title={habit.name}
        onBack={goBack}
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton icon="create-outline" label="Edit habit" onPress={() => router.push({ pathname: '/habit/[id]/edit', params: { id: habit.id } })} />
            <IconButton
              icon={habit.archived ? 'arrow-undo-outline' : 'archive-outline'}
              label={habit.archived ? 'Restore habit' : 'Archive habit'}
              onPress={() => setArchived(habit.id, !habit.archived)}
            />
            <IconButton icon="trash-outline" label="Delete habit" color={t.danger} onPress={onDelete} />
          </View>
        }
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <HabitIcon icon={habit.icon} color={color} size={52} />
        <T tone="secondary" style={{ flex: 1 }}>
          {habit.description || 'No description.'}
          {habit.archived ? '  (archived)' : ''}
        </T>
      </View>

      <Grid columns={breakpoint === 'compact' ? 2 : 4} gap={space.md}>
        {[
          <StatTile key="s" icon="flame-outline" label="Current streak" value={`${stats.streak}d`} />,
          <StatTile key="l" icon="trophy-outline" label="Longest streak" value={`${stats.longest}d`} />,
          <StatTile key="r" icon="pie-chart-outline" label="30-day rate" value={pct(stats.rate30.rate)} hint={`${stats.rate30.done}/${stats.rate30.scheduled} days`} />,
          <StatTile key="t" icon="checkmark-done-outline" label="Total check-ins" value={String(stats.total)} />,
        ]}
      </Grid>

      {isWide ? (
        <View style={{ flexDirection: 'row', gap: space.xl, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: space.lg }}>
            {todayCard}
            {infoCard}
          </View>
          <View style={{ flex: 1.2, gap: space.lg }}>
            <MonthCalendar habit={habit} logs={logs} today={today} weekStartsOn={weekStartsOn} onToggle={(d) => toggleCompletion(habit.id, d)} />
            <TrendChart title="Weekly consistency" subtitle="Last 12 weeks" points={stats.weekly} color={color} bucketLabel={(k) => formatShort(k)} />
          </View>
        </View>
      ) : (
        <>
          {todayCard}
          <MonthCalendar habit={habit} logs={logs} today={today} weekStartsOn={weekStartsOn} onToggle={(d) => toggleCompletion(habit.id, d)} />
          <TrendChart title="Weekly consistency" subtitle="Last 12 weeks" points={stats.weekly} color={color} bucketLabel={(k) => formatShort(k)} />
          {infoCard}
        </>
      )}
      <Button label="Edit habit" icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/habit/[id]/edit', params: { id: habit.id } })} style={{ alignSelf: 'flex-start' }} />
    </Screen>
  );
}

function InfoRow({ icon, label, value }: { icon: 'repeat' | 'alarm-outline' | 'calendar-outline'; label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 32 }}>
      <Ionicons name={icon} size={18} color={t.textSecondary} />
      <T tone="secondary" style={{ width: 90 }}>{label}</T>
      <T style={{ flex: 1 }}>{value}</T>
    </View>
  );
}

/** Local draft that commits to the store on blur, so typing doesn't write storage per keystroke. */
function NoteField({ initial, onSave }: { initial: string; onSave: (note: string) => void }) {
  const t = useTheme();
  const [draft, setDraft] = useState(initial);
  return (
    <TextInput
      accessibilityLabel="Note for today"
      placeholder="Add a note for today…"
      placeholderTextColor={t.textMuted}
      value={draft}
      onChangeText={setDraft}
      onBlur={() => draft !== initial && onSave(draft.trim())}
      multiline
      style={{
        minHeight: 64,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: t.border,
        padding: space.md,
        color: t.text,
        backgroundColor: t.bg,
        fontSize: 15,
        textAlignVertical: 'top',
      }}
    />
  );
}
