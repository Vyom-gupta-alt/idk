import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** AsyncStorage: native storage on iOS/Android, so data survives app restarts. */
export const persistStorage = createJSONStorage(() => AsyncStorage);

export type StorageBackend = 'device' | 'browser' | 'claude';

export async function storageBackend(): Promise<StorageBackend> {
  return 'device';
}

/** Remote change feed; only the Claude-hosted web build has one. */
export function watchRemote(_name: string, _onChange: () => void): () => void {
  return () => {};
}
