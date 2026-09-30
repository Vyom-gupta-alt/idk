import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import { claudeUse } from '@/lib/claudeHost';
import type { StorageBackend } from './storage';

/**
 * Web persistence.
 *
 * - Plain browser: `localStorage`.
 * - Hosted as a Claude artifact: each store is one document in the viewer's
 *   private `data/users/<id>/` subtree of the artifact database, so data
 *   survives cleared browser storage and follows the user across devices.
 *   `localStorage` is kept as a mirror and as the migration source the first
 *   time the database is empty.
 */

type DocRef = {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined; metadata: { hasPendingWrites: boolean } }>;
  set(data: Record<string, unknown>): Promise<void>;
  onSnapshot(
    next: (s: { exists: boolean; data(): Record<string, unknown> | undefined; metadata: { hasPendingWrites: boolean } }) => void,
    error?: (e: unknown) => void,
  ): () => void;
};
type Remote = { ref: (name: string) => DocRef };

const local = {
  get(name: string): string | null {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  set(name: string, value: string) {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* storage blocked — the remote copy (if any) still holds the data */
    }
  },
  remove(name: string) {
    try {
      localStorage.removeItem(name);
    } catch {}
  },
};

let remotePromise: Promise<Remote | null> | null = null;
function remote(): Promise<Remote | null> {
  remotePromise ??= (async () => {
    const [db, user] = await Promise.all([claudeUse<any>('db'), claudeUse<any>('user')]);
    const id: string | null = db && user ? await user.id().catch(() => null) : null;
    if (!db || !id) return null;
    // Path segments allow letters, digits and `_ - . ~ : @ +` only.
    return { ref: (name: string) => db.doc(`data/users/${id}/${name.replace(/[^\w.~:@+-]/g, ':')}`) as DocRef };
  })();
  return remotePromise;
}

/** Last value known to be in the database, per key — used to ignore our own echoes. */
const synced = new Map<string, string>();
const pending = new Map<string, string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Map<string, Promise<void>>();

async function flush(name: string): Promise<void> {
  const r = await remote();
  const value = pending.get(name);
  if (!r || value === undefined) return;
  // One write at a time per document.
  await inflight.get(name);
  if (pending.get(name) !== value) return; // superseded while waiting
  pending.delete(name);
  const write = r
    .ref(name)
    .set({ json: value, updatedAt: new Date().toISOString() })
    .then(() => void synced.set(name, value))
    .catch((e) => {
      console.warn('[habitual] save failed', e);
      if (!pending.has(name)) pending.set(name, value); // retry with the next change or flush
    });
  inflight.set(name, write);
  await write;
}

function flushAll() {
  for (const [name, t] of timers) {
    clearTimeout(t);
    timers.delete(name);
    void flush(name);
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushAll());
  window.addEventListener('pagehide', flushAll);
}

const hybrid: StateStorage = {
  async getItem(name) {
    const r = await remote();
    if (!r) return local.get(name);
    try {
      const snap = await r.ref(name).get();
      const value = snap.exists ? snap.data()?.json : undefined;
      if (typeof value === 'string') {
        synced.set(name, value);
        local.set(name, value);
        return value;
      }
    } catch (e) {
      console.warn('[habitual] load failed, using this browser’s copy', e);
    }
    // Empty database: start from (and upload) whatever this browser has.
    const fallback = local.get(name);
    if (fallback) {
      pending.set(name, fallback);
      void flush(name);
    }
    return fallback;
  },
  setItem(name, value) {
    local.set(name, value);
    if (!remotePromise && typeof (globalThis as { claude?: unknown }).claude === 'undefined') return;
    pending.set(name, value);
    clearTimeout(timers.get(name));
    timers.set(
      name,
      setTimeout(() => {
        timers.delete(name);
        void flush(name);
      }, 800),
    );
  },
  removeItem(name) {
    local.remove(name);
  },
};

export const persistStorage = createJSONStorage(() => hybrid);

export async function storageBackend(): Promise<StorageBackend> {
  return (await remote()) ? 'claude' : 'browser';
}

/**
 * Calls `onChange` when another device or tab saves a newer copy, so an
 * open page never overwrites fresher data with a stale one.
 */
export function watchRemote(name: string, onChange: () => void): () => void {
  let unsub: (() => void) | null = null;
  let stopped = false;
  void remote().then((r) => {
    if (!r || stopped) return;
    unsub = r.ref(name).onSnapshot(
      (snap) => {
        const value = snap.exists ? snap.data()?.json : undefined;
        if (typeof value !== 'string' || snap.metadata.hasPendingWrites) return;
        if (value === synced.get(name) || pending.has(name) || timers.has(name)) return;
        synced.set(name, value);
        local.set(name, value);
        onChange();
      },
      (e) => console.warn('[habitual] live sync stopped', e),
    );
  });
  return () => {
    stopped = true;
    unsub?.();
  };
}
