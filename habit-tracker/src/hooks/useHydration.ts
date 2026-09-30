import { useEffect, useState } from 'react';
import { useHabitStore } from '@/store/habitStore';
import { useSettingsStore } from '@/store/settingsStore';
import { watchRemote } from '@/store/storage';

const stores = [useHabitStore, useSettingsStore];

/**
 * True once every persisted store has rehydrated. Afterwards, re-hydrates a
 * store whenever another device saves a newer copy (Claude-hosted web only).
 */
export function useHydration(): boolean {
  const allHydrated = () => stores.every((s) => s.persist.hasHydrated());
  const [hydrated, setHydrated] = useState(allHydrated);

  useEffect(() => {
    const unsubs = stores.map((s) => s.persist.onFinishHydration(() => setHydrated(allHydrated())));
    setHydrated(allHydrated());
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const unsubs = stores.map((s) => {
      const name = s.persist.getOptions().name;
      return name ? watchRemote(name, () => void s.persist.rehydrate()) : () => {};
    });
    return () => unsubs.forEach((u) => u());
  }, [hydrated]);

  return hydrated;
}
