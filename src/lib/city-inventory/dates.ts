/**
 * city-inventory/dates.ts — read-side date normalisation. Pure.
 *
 * Firestore's Admin SDK hands back `Timestamp` instances on read, never
 * plain `Date` — even for a field written as `new Date()` (axioms §31).
 * Every date read from a stored inventory doc goes through `toDateOrNull`.
 */

interface TimestampLike {
  toDate: () => Date;
}

function isTimestampLike(v: unknown): v is TimestampLike {
  return typeof v === 'object' && v !== null && typeof (v as TimestampLike).toDate === 'function';
}

function valid(d: Date): Date | null {
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Timestamp / Date / ISO string / epoch ms / `{seconds,nanoseconds}` ⇒ Date, else null. */
export function toDateOrNull(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return valid(v);
  if (isTimestampLike(v)) {
    const d = v.toDate();
    return d instanceof Date ? valid(d) : null;
  }
  if (typeof v === 'string' && v.length > 0) return valid(new Date(v));
  if (typeof v === 'number') return valid(new Date(v));
  if (typeof v === 'object') {
    const s = (v as { seconds?: unknown; _seconds?: unknown }).seconds ?? (v as { _seconds?: unknown })._seconds;
    if (typeof s === 'number') return valid(new Date(s * 1000));
  }
  return null;
}
