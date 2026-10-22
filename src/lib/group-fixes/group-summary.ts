/**
 * The post-workout "together" summary (TogetherBlock / "יחד" story) as one
 * pure builder, shared by the server route (enable_group_fixes_v1) and the
 * legacy client hook. The client used to query OTHER users' workouts, which
 * firestore.rules deny — so the block was always empty. The server computes
 * it with the Admin SDK and returns this aggregate only (no workout docs).
 */

export interface GroupParticipant {
  uid: string;
  name: string;
  photoURL?: string;
  distanceKm: number;
  pace: number; // min/km, 0 if unavailable
}

export interface GroupSummaryCtx {
  groupName: string;
  collectiveDistanceKm: number;
  participantCount: number;
  participants: GroupParticipant[];
  /** undefined = field not in Firestore yet; hide the chip */
  coLocationMode: 'physical' | 'virtual' | undefined;
}

export interface SummaryWorkoutLike {
  userId?: unknown;
  distance?: unknown;
  pace?: unknown;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function buildGroupSummary(input: {
  groupName: string;
  attendance: Record<string, unknown>;
  workouts: SummaryWorkoutLike[];
  currentUid?: string;
}): GroupSummaryCtx {
  const profiles = (input.attendance.attendeeProfiles ?? {}) as Record<string, { name?: unknown; photoURL?: unknown }>;

  const distanceByUid: Record<string, number> = {};
  const paceByUid: Record<string, number> = {};
  for (const w of input.workouts) {
    if (typeof w.userId !== 'string' || !w.userId) continue;
    distanceByUid[w.userId] = (distanceByUid[w.userId] ?? 0) + num(w.distance);
    if (num(w.pace) > 0) paceByUid[w.userId] = num(w.pace);
  }

  const uids = Object.keys(profiles);
  const participants: GroupParticipant[] = uids.map((uid) => ({
    uid,
    name: typeof profiles[uid]?.name === 'string' ? (profiles[uid].name as string) : '',
    ...(typeof profiles[uid]?.photoURL === 'string' ? { photoURL: profiles[uid].photoURL as string } : {}),
    distanceKm: distanceByUid[uid] ?? 0,
    pace: paceByUid[uid] ?? 0,
  }));

  // Current user pinned to top, then alphabetical
  participants.sort((a, b) => {
    if (a.uid === input.currentUid) return -1;
    if (b.uid === input.currentUid) return 1;
    return a.name.localeCompare(b.name, 'he');
  });

  const collective = participants.reduce((sum, p) => sum + p.distanceKm, 0);
  // Siblings not saved yet (finish-time race): activeCount × own distance.
  const progress = input.attendance.collectiveProgress as { activeCount?: unknown } | undefined;
  const effective = collective > 0
    ? collective
    : (typeof progress?.activeCount === 'number' ? progress.activeCount : uids.length) *
      (distanceByUid[input.currentUid ?? ''] ?? 0);

  return {
    groupName: input.groupName,
    collectiveDistanceKm: Math.round(effective * 100) / 100,
    participantCount: Math.max(uids.length, 1),
    participants,
    coLocationMode: undefined,
  };
}

/** Who may read a session's summary: an attendee of it, or a member of the group. */
export function canReadGroupSummary(input: { uid: string; attendees?: unknown; isMember: boolean }): boolean {
  if (input.isMember) return true;
  return Array.isArray(input.attendees) && input.attendees.includes(input.uid);
}
