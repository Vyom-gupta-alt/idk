import { useEffect, useMemo, useState } from 'react';
import { Modal, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useHabitStore } from '@/store/habitStore';
import { useSettingsStore } from '@/store/settingsStore';
import { storageBackend, type StorageBackend } from '@/store/storage';
import { useTheme } from '@/hooks/useTheme';
import { useResponsive } from '@/hooks/useResponsive';
import { ensurePermission, notificationsSupported } from '@/lib/notifications';
import { exportBackup, parseBackup } from '@/lib/backup';
import { confirm, notify } from '@/lib/confirm';
import { Button, Card, Grid, IconButton, Screen, ScreenHeader, Segmented, SettingRow, T, Toggle } from '@/components/ui';
import { HabitIcon } from '@/components/HabitIcon';
import { habitColor } from '@/theme/palette';
import { radius, space } from '@/theme/tokens';
import type { Weekday } from '@/types/habit';

export default function Settings() {
  const t = useTheme();
  const { isWide } = useResponsive();
  const settings = useSettingsStore();
  const habits = useHabitStore((s) => s.habits);
  const { moveHabit, setArchived, deleteHabit, importData, loadDemoData, resetAll } = useHabitStore.getState();
  const [importOpen, setImportOpen] = useState(false);
  const [backend, setBackend] = useState<StorageBackend | null>(null);
  useEffect(() => {
    storageBackend().then(setBackend);
  }, []);

  const sorted = useMemo(() => [...habits].sort((a, b) => a.order - b.order), [habits]);
  const active = sorted.filter((h) => !h.archived);
  const archived = sorted.filter((h) => h.archived);

  const onToggleNotifications = async (enabled: boolean) => {
    if (enabled && !(await ensurePermission())) {
      notify('Notifications blocked', 'Enable notifications for Habitual in your device settings to get reminders.');
      return;
    }
    settings.setNotificationsEnabled(enabled);
  };

  const preferences = (
    <Card style={{ gap: space.sm }}>
      <T variant="heading">Preferences</T>
      <SettingRow title="Appearance">
        <Segmented
          label="Appearance"
          value={settings.theme}
          onChange={settings.setTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </SettingRow>
      <SettingRow title="Week starts on">
        <Segmented<Weekday>
          label="Week starts on"
          value={settings.weekStartsOn}
          onChange={settings.setWeekStartsOn}
          options={[
            { value: 1, label: 'Monday' },
            { value: 0, label: 'Sunday' },
          ]}
        />
      </SettingRow>
      <SettingRow
        title="Reminders"
        subtitle={
          notificationsSupported
            ? 'Master switch for every habit reminder on this device.'
            : "Phone notifications need the iOS or Android app. The web version saves your reminder times but can't send alerts."
        }
      >
        <Toggle
          label="Reminders"
          value={settings.notificationsEnabled}
          disabled={!notificationsSupported}
          onChange={onToggleNotifications}
        />
      </SettingRow>
    </Card>
  );

  const manage = (
    <Card style={{ gap: space.sm }}>
      <T variant="heading">Habits</T>
      <T variant="caption" tone="secondary">Reorder how habits appear on the dashboard, or archive ones you've paused.</T>
      {active.length === 0 && <T tone="muted">No active habits.</T>}
      {active.map((h, i) => (
        <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <HabitIcon icon={h.icon} color={habitColor(h.color, t.scheme)} size={30} />
          <T style={{ flex: 1 }} numberOfLines={1}>{h.name}</T>
          <IconButton icon="arrow-up" label={`Move ${h.name} up`} size={18} color={i === 0 ? t.axis : undefined} onPress={() => moveHabit(h.id, -1)} />
          <IconButton icon="arrow-down" label={`Move ${h.name} down`} size={18} color={i === active.length - 1 ? t.axis : undefined} onPress={() => moveHabit(h.id, 1)} />
          <IconButton icon="archive-outline" label={`Archive ${h.name}`} size={18} onPress={() => setArchived(h.id, true)} />
        </View>
      ))}
      {archived.length > 0 && (
        <>
          <T variant="label" tone="secondary" style={{ marginTop: space.md }}>Archived</T>
          {archived.map((h) => (
            <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <HabitIcon icon={h.icon} color={t.textMuted} size={30} />
              <T style={{ flex: 1 }} tone="secondary" numberOfLines={1}>{h.name}</T>
              <IconButton icon="arrow-undo-outline" label={`Restore ${h.name}`} size={18} onPress={() => setArchived(h.id, false)} />
              <IconButton
                icon="trash-outline"
                label={`Delete ${h.name}`}
                size={18}
                color={t.danger}
                onPress={async () => {
                  if (await confirm(`Delete “${h.name}”?`, 'Its full history will be removed.')) deleteHabit(h.id);
                }}
              />
            </View>
          ))}
        </>
      )}
    </Card>
  );

  const data = (
    <Card style={{ gap: space.md }}>
      <T variant="heading">Data</T>
      <T variant="caption" tone="secondary">
        {habits.length} habit{habits.length === 1 ? '' : 's'}.{' '}
        {backend === 'claude'
          ? 'Saved privately to your Claude account, so it syncs wherever you open this page.'
          : backend === 'browser'
            ? 'Saved in this browser only. Export a backup to move to another device.'
            : 'Stored locally on this device. Export a backup to move to another device.'}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Button label="Export backup" icon="download-outline" variant="secondary" onPress={() => exportBackup(useHabitStore.getState())} />
        <Button label="Import backup" icon="cloud-upload-outline" variant="secondary" onPress={() => setImportOpen(true)} />
        <Button
          label="Load sample data"
          icon="flask-outline"
          variant="secondary"
          onPress={async () => {
            if (habits.length === 0 || (await confirm('Replace your data?', 'Sample habits will replace your current habits and history.', 'Replace'))) {
              loadDemoData();
              router.navigate('/analytics');
            }
          }}
        />
        <Button
          label="Erase everything"
          icon="trash-outline"
          variant="danger"
          onPress={async () => {
            if (await confirm('Erase all data?', 'Every habit and its history will be permanently deleted.', 'Erase')) resetAll();
          }}
        />
      </View>
    </Card>
  );

  return (
    <Screen maxWidth={1100}>
      <ScreenHeader title="Settings" />
      {isWide ? (
        <Grid columns={2}>{[<View key="l" style={{ gap: space.lg }}>{preferences}{data}</View>, <View key="r">{manage}</View>]}</Grid>
      ) : (
        <>
          {preferences}
          {manage}
          {data}
        </>
      )}
      <T variant="caption" tone="muted" style={{ textAlign: 'center' }}>Habitual · v1.0.0</T>
      <ImportModal
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={async (text) => {
          try {
            const parsed = parseBackup(text);
            if (await confirm('Import backup?', `This replaces your current data with ${parsed.habits.length} habits.`, 'Import')) {
              importData(parsed);
              setImportOpen(false);
            }
          } catch (e) {
            notify('Import failed', (e as Error).message);
          }
        }}
      />
    </Screen>
  );
}

function ImportModal({ visible, onClose, onImport }: { visible: boolean; onClose: () => void; onImport: (text: string) => void }) {
  const t = useTheme();
  const [text, setText] = useState('');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: space.lg }}>
        <Card style={{ width: '100%', maxWidth: 560, gap: space.md }}>
          <T variant="heading">Import backup</T>
          <T variant="caption" tone="secondary">Paste the contents of a Habitual backup file.</T>
          <TextInput
            accessibilityLabel="Backup JSON"
            multiline
            value={text}
            onChangeText={setText}
            placeholder='{"habits": [...], "logs": {...}}'
            placeholderTextColor={t.textMuted}
            style={{ minHeight: 180, maxHeight: 320, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: space.md, color: t.text, fontFamily: 'monospace', fontSize: 12, textAlignVertical: 'top' }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm }}>
            <Button label="Cancel" variant="secondary" onPress={onClose} />
            <Button label="Import" icon="checkmark" disabled={!text.trim()} onPress={() => onImport(text)} />
          </View>
        </Card>
      </View>
    </Modal>
  );
}
