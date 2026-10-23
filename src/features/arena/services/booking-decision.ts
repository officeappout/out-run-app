/**
 * What an RSVP does to a session's attendance doc — pure, unit-tested. Used
 * inside the Firestore transaction (enable_group_fixes_v1) so the capacity
 * check and the write see the SAME snapshot: two members tapping at once can
 * no longer both pass `currentCount < maxParticipants`.
 */
export type BookingAction = 'create' | 'already-booked' | 'already-waitlisted' | 'waitlist' | 'book';

export function decideBooking(
  data: { attendees?: unknown; waitlist?: unknown; currentCount?: unknown; maxParticipants?: unknown } | undefined,
  uid: string,
): BookingAction {
  if (!data) return 'create';
  const attendees = Array.isArray(data.attendees) ? data.attendees : [];
  if (attendees.includes(uid)) return 'already-booked';
  const waitlist = Array.isArray(data.waitlist) ? data.waitlist : [];
  if (waitlist.includes(uid)) return 'already-waitlisted';
  // currentCount drifts (joins that never incremented it) — trust the larger.
  const count = Math.max(typeof data.currentCount === 'number' ? data.currentCount : 0, attendees.length);
  const max = typeof data.maxParticipants === 'number' ? data.maxParticipants : null;
  return max != null && count >= max ? 'waitlist' : 'book';
}
