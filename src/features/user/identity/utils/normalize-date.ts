/**
 * normalize-date — one converter for every startDate shape in stored profiles
 * (crash fix, 09.07.2026).
 *
 * startDate reaches the client in THREE shapes, because writers diverged:
 *   • ISO string        — progression.service (program assignment)
 *   • Firestore Timestamp object ({seconds} / .toDate()) — cycle-restart and
 *     profile.service write `new Date()`, which Firestore stores as Timestamp
 *   • Date              — in-memory, pre-persist
 * `new Date(timestampObject)` silently yields Invalid Date, which then
 * crashes `toISOString()` downstream (derivePeriodizationWeek line ~91).
 */
export function normalizeDateField(raw: unknown): Date | undefined {
  if (raw == null) return undefined;
  // Firestore Timestamp (client or admin SDK): has toDate()
  if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    const d = (raw as { toDate: () => Date }).toDate();
    return isNaN(d.getTime()) ? undefined : d;
  }
  // Serialized Timestamp that lost its prototype ({seconds, nanoseconds})
  const secs = (raw as { seconds?: unknown }).seconds;
  if (typeof secs === 'number') {
    const d = new Date(secs * 1000);
    return isNaN(d.getTime()) ? undefined : d;
  }
  const d = new Date(raw as string | number | Date);
  return isNaN(d.getTime()) ? undefined : d;
}
