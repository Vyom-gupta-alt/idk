export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
