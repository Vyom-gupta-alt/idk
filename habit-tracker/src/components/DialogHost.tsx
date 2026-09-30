import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Button, Card, T } from '@/components/ui';
import { type DialogRequest, registerDialogHost } from '@/lib/confirm';
import { space } from '@/theme/tokens';

/** Renders `confirm()` / `notify()` requests as in-app dialogs (web). */
export function DialogHost() {
  const [req, setReq] = useState<DialogRequest | null>(null);

  useEffect(() => {
    registerDialogHost((next) => setReq(next));
    return () => registerDialogHost(null);
  }, []);

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  return (
    <Modal visible={!!req} transparent animationType="fade" onRequestClose={() => close(false)}>
      <Pressable
        accessibilityLabel="Dismiss"
        onPress={() => close(false)}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: space.lg }}
      >
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420 }}>
          <Card style={{ gap: space.md }}>
            <T variant="heading" accessibilityRole="header">{req?.title}</T>
            <T tone="secondary">{req?.message}</T>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm }}>
              {req?.confirmLabel ? (
                <>
                  <Button label="Cancel" variant="secondary" onPress={() => close(false)} />
                  <Button label={req.confirmLabel} variant="danger" onPress={() => close(true)} />
                </>
              ) : (
                <Button label="OK" onPress={() => close(true)} />
              )}
            </View>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
