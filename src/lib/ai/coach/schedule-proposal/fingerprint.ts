/**
 * Kelly phase 2 — the schedule fingerprint. Pure. A proposal is built on one version of the
 * user's schedule (the recurring template + the strength / running day letters); if any of
 * them changed before the user taps "אשר", the proposal is stale and is not applied.
 */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
    );
  }
  return v ?? null;
}

/** FNV-1a 32-bit, hex. Not security: a change detector. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore profile, read through field guards
export function scheduleFingerprint(profile: Record<string, any> | null | undefined): string {
  const l = profile?.lifestyle ?? {};
  return fnv1a(
    JSON.stringify(
      stable({
        t: l.recurringTemplate ?? null,
        d: Array.isArray(l.scheduleDays) ? [...l.scheduleDays].sort() : null,
        r: Array.isArray(profile?.running?.scheduleDays) ? [...profile!.running.scheduleDays].sort() : null,
      }),
    ),
  );
}
