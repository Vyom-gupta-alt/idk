import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/**
 * AsyncStorage is backed by native storage on iOS/Android and by
 * `localStorage` on web, so persisted state survives app restarts and
 * browser sessions alike.
 */
export const persistStorage = createJSONStorage(() => AsyncStorage);
