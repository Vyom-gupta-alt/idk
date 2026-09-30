import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export type ShortcutMap = Record<string, () => void>;

/**
 * Global single-key shortcuts on web/desktop. Ignored while typing in a field
 * or when a modifier key is held, so browser shortcuts keep working.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled = true): void {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      const handler = ref.current[e.key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
