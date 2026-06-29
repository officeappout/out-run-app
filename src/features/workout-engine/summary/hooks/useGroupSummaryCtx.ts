'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

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

/**
 * Fetches group session context for the post-workout summary screen.
 * Reads the attendance doc for participant profiles and queries sibling
 * workouts to build the collective distance block.
 */
export function useGroupSummaryCtx(
  groupId: string | null | undefined,
  attendanceId: string | null | undefined,
  currentUid: string | undefined,
): { ctx: GroupSummaryCtx | null; loading: boolean } {
  const [ctx, setCtx] = useState<GroupSummaryCtx | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!groupId || !attendanceId) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // ── 1. Read attendance doc for profiles ──────────────────────────
        const attendanceRef = doc(
          db,
          'community_groups',
          groupId,
          'attendance',
          attendanceId,
        );
        const attendanceSnap = await getDoc(attendanceRef);
        const attendance = attendanceSnap.data() ?? {};

        const attendeeProfiles: Record<string, { name: string; photoURL?: string }> =
          attendance.attendeeProfiles ?? {};

        const groupDocSnap = await getDoc(doc(db, 'community_groups', groupId));
        const groupName: string = groupDocSnap.data()?.name ?? '';

        // coLocationMode: not stored yet — hide chip in Phase 1
        const coLocationMode: 'physical' | 'virtual' | undefined = undefined;

        // ── 2. Query sibling workouts for per-participant distances ───────
        const workoutsQuery = query(
          collection(db, 'workouts'),
          where('groupId', '==', groupId),
          where('attendanceId', '==', attendanceId),
        );
        const workoutsSnap = await getDocs(workoutsQuery);
        const siblingWorkouts = workoutsSnap.docs.map((d) => d.data() as WorkoutHistoryEntry);

        // ── 3. Build participant list ─────────────────────────────────────
        // Merge profiles from attendeeProfiles with distances from sibling workouts.
        const distanceByUid: Record<string, number> = {};
        const paceByUid: Record<string, number> = {};
        for (const w of siblingWorkouts) {
          if (w.userId) {
            distanceByUid[w.userId] = (distanceByUid[w.userId] ?? 0) + (w.distance ?? 0);
            if (w.pace && w.pace > 0) paceByUid[w.userId] = w.pace;
          }
        }

        const uids = Object.keys(attendeeProfiles);
        const participants: GroupParticipant[] = uids.map((uid) => ({
          uid,
          name: attendeeProfiles[uid]?.name ?? '',
          photoURL: attendeeProfiles[uid]?.photoURL,
          distanceKm: distanceByUid[uid] ?? 0,
          pace: paceByUid[uid] ?? 0,
        }));

        // Current user pinned to top, then alphabetical
        participants.sort((a, b) => {
          if (a.uid === currentUid) return -1;
          if (b.uid === currentUid) return 1;
          return a.name.localeCompare(b.name, 'he');
        });

        const collectiveDistanceKm = participants.reduce((sum, p) => sum + p.distanceKm, 0);

        // Fallback when siblings haven't saved yet (race condition at finish time):
        // use activeCount * own distance as an estimate.
        const effectiveDistance =
          collectiveDistanceKm > 0
            ? collectiveDistanceKm
            : (attendance.collectiveProgress?.activeCount ?? uids.length) *
              (distanceByUid[currentUid ?? ''] ?? 0);

        if (!cancelled) {
          setCtx({
            groupName,
            collectiveDistanceKm: Math.round(effectiveDistance * 100) / 100,
            participantCount: Math.max(uids.length, 1),
            participants,
            coLocationMode,
          });
        }
      } catch (err) {
        console.warn('[useGroupSummaryCtx] fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [groupId, attendanceId, currentUid]);

  return { ctx, loading };
}
