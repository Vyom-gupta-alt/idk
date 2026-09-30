/**
 * Access to Claude artifact runtime capabilities (`window.claude.use`).
 * Resolves `null` everywhere else — native apps, a plain browser tab,
 * or a viewer that didn't grant the capability.
 */
export function claudeUse<T = any>(name: string): Promise<T | null> {
  const host = (globalThis as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (typeof host?.use !== 'function') return Promise.resolve(null);
  return host.use(name).then((v) => (v ?? null) as T | null, () => null);
}
