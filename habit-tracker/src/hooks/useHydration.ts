import { useEffect, useState } from 'react';
import { useHabitStore } from '@/store/habitStore';
import { useSettingsStore } from '@/store/settingsStore';

const stores = [useHabitStore, useSettingsStore];

/** True once every persisted store has rehydrated from local storage. */
export function useHydration(): boolean {
  const allHydrated = () => stores.every((s) => s.persist.hasHydrated());
  const [hydrated, setHydrated] = useState(allHydrated);

  useEffect(() => {
    const unsubs = stores.map((s) => s.persist.onFinishHydration(() => setHydrated(allHydrated())));
    setHydrated(allHydrated());
    return () => unsubs.forEach((u) => u());
  }, []);

  return hydrated;
}
