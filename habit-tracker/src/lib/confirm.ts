import { Alert, Platform } from 'react-native';

export interface DialogRequest {
  title: string;
  message: string;
  /** Omit for an informational dialog with a single OK button. */
  confirmLabel?: string;
  resolve: (ok: boolean) => void;
}

type Host = (req: DialogRequest) => void;
let host: Host | null = null;

/** Registered by `<DialogHost />`. Web uses in-app dialogs because sandboxed
 *  hosts (such as a Claude artifact) block `window.confirm` and `alert`. */
export function registerDialogHost(h: Host | null) {
  host = h;
}

/** Cross-platform destructive-action confirmation. */
export function confirm(title: string, message: string, confirmLabel = 'Delete'): Promise<boolean> {
  if (Platform.OS !== 'web') {
    return new Promise((resolve) =>
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ]),
    );
  }
  if (!host) return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => host!({ title, message, confirmLabel, resolve }));
}

export function notify(title: string, message: string): void {
  if (Platform.OS !== 'web') return Alert.alert(title, message);
  if (!host) return window.alert(`${title}\n\n${message}`);
  host({ title, message, resolve: () => {} });
}
