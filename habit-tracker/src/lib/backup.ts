import { Platform, Share } from 'react-native';
import type { HabitData } from '@/store/habitStore';
import { claudeUse } from '@/lib/claudeHost';

export const BACKUP_VERSION = 1;

export function serializeBackup(data: HabitData): string {
  return JSON.stringify({ app: 'habitual', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), ...data }, null, 2);
}

/** Parse and minimally validate a backup. Throws with a readable message on bad input. */
export function parseBackup(text: string): HabitData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That is not valid JSON.');
  }
  const obj = raw as Partial<HabitData> & { app?: string };
  if (!obj || !Array.isArray(obj.habits) || typeof obj.logs !== 'object' || obj.logs === null) {
    throw new Error('Backup must contain "habits" and "logs".');
  }
  for (const h of obj.habits) {
    if (typeof h?.id !== 'string' || typeof h?.name !== 'string' || !h.frequency || !h.reminder) {
      throw new Error('One or more habits are malformed.');
    }
    h.subtasks ??= [];
  }
  return { habits: obj.habits, logs: obj.logs };
}

export async function exportBackup(data: HabitData): Promise<void> {
  const json = serializeBackup(data);
  if (Platform.OS === 'web') {
    const filename = `habitual-backup-${new Date().toISOString().slice(0, 10)}.json`;
    // Inside a Claude artifact, page-initiated downloads are blocked; ask the host.
    const downloads = await claudeUse<{ save(r: { filename: string; data: string }): Promise<unknown> }>('downloads');
    if (downloads) {
      await downloads.save({ filename, data: json }).catch(() => {});
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: 'Habitual backup', message: json });
}
