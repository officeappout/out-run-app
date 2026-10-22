'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useGroupFixesV1 } from '@/lib/group-fixes/useGroupFixesV1';
import { buildGroupSummary, type GroupSummaryCtx } from '@/lib/group-fixes/group-summary';

export type { GroupParticipant, GroupSummaryCtx } from '@/lib/group-fixes/group-summary';

/** enable_group_fixes_v1: the server computes the aggregate (Admin SDK). */
async function fetchServerSummary(groupId: string, attendanceId: string): Promise<GroupSummaryCtx | null> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return null;
  const qs = new URLSearchParams({ groupId, attendanceId });
  const res = await fetch(`/api/social/group-summary?${qs}`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) return null;
  return ((await res.json()) as { ctx?: GroupSummaryCtx }).ctx ?? null;
}

/**
 * Legacy (flag off): reads the attendance doc + queries sibling workouts from
 * the client. The rules deny other users' workouts, so only the viewer's own
 * distance ever arrives — kept byte-identical until the flag ships.
 */
async function fetchClientSummary(groupId: string, attendanceId: string, currentUid?: string): Promise<GroupSummaryCtx> {
  const attendanceSnap = await getDoc(doc(db, 'community_groups', groupId, 'attendance', attendanceId));
  const attendance = attendanceSnap.data() ?? {};
  const groupDocSnap = await getDoc(doc(db, 'community_groups', groupId));
  const groupName: string = groupDocSnap.data()?.name ?? '';
  const workoutsSnap = await getDocs(query(
    collection(db, 'workouts'),
    where('groupId', '==', groupId),
    where('attendanceId', '==', attendanceId),
  ));
  return buildGroupSummary({ groupName, attendance, workouts: workoutsSnap.docs.map((d) => d.data()), currentUid });
}

/**
 * Fetches group session context for the post-workout summary screen.
 */
export function useGroupSummaryCtx(
  groupId: string | null | undefined,
  attendanceId: string | null | undefined,
  currentUid: string | undefined,
): { ctx: GroupSummaryCtx | null; loading: boolean } {
  const [ctx, setCtx] = useState<GroupSummaryCtx | null>(null);
  const [loading, setLoading] = useState(false);
  const groupFixes = useGroupFixesV1();

  useEffect(() => {
    if (!groupId || !attendanceId) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const next = groupFixes
          ? await fetchServerSummary(groupId, attendanceId)
          : await fetchClientSummary(groupId, attendanceId, currentUid);
        if (!cancelled && next) setCtx(next);
      } catch (err) {
        console.warn('[useGroupSummaryCtx] fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [groupId, attendanceId, currentUid, groupFixes]);

  return { ctx, loading };
}
