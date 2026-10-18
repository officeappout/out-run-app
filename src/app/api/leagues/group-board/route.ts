/**
 * GET /api/leagues/group-board — one group's own league board this period
 * (home v2, 18.10.2026): the group's points, how many of them came from
 * steps, its km, and each member's points / steps points / km.
 *
 * The numbers come from league_scope_stats/{window}_{period}_group_{groupId}
 * (onWorkoutCreateLeagueStats + leagueStepsRollup already count every
 * workout, step and km toward each group in the user's social.groupIds).
 * Neither that doc nor its members/{uid} rows are client-readable, so this
 * route reads them with the Admin SDK — and only for a caller who is a
 * member of the group (community_groups/{groupId}/members/{uid} exists),
 * the same people who already see each other in the group's member list.
 * Names come from that member list too.
 *
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 * Query: groupId = <community group id>, window = weekly | monthly.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { buildGroupBoard, periodKeysFor, type GroupMemberStatsRow, type ScopeStatsDoc } from '@/features/arena/services/league-scope-keys';

export const dynamic = 'force-dynamic';

const MAX_MEMBERS = 200;

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams;
  const groupId = q.get('groupId') ?? '';
  const window = q.get('window') ?? '';
  if ((window !== 'weekly' && window !== 'monthly') || !groupId || groupId.length > 200 || groupId.includes('/')) {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const db = getAdminDb();
  const group = db.collection('community_groups').doc(groupId);
  if (!(await group.collection('members').doc(uid).get()).exists) {
    return NextResponse.json({ error: 'not-a-member' }, { status: 403 });
  }

  const periodKey = periodKeysFor(new Date())[window];
  const statsRef = db.collection('league_scope_stats').doc(`${window}_${periodKey}_group_${groupId}`);
  const [statSnap, memberSnap] = await Promise.all([statsRef.get(), statsRef.collection('members').limit(MAX_MEMBERS).get()]);
  const rows: GroupMemberStatsRow[] = memberSnap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<GroupMemberStatsRow, 'uid'>) }));

  // Names from the group's member list (same fallback as getGroupMembers).
  const names = new Map<string, string>();
  if (rows.length) {
    const snaps = await db.getAll(...rows.map((r) => group.collection('members').doc(r.uid)));
    snaps.forEach((s) => {
      if (!s.exists) return;
      const n = s.data()?.name;
      names.set(s.id, typeof n === 'string' && n ? n : 'משתמש');
    });
  }
  // Only people still in the group: someone who left keeps their stats row
  // for the period (it's part of the group's total), but no row of their own.
  const current = rows.filter((r) => names.has(r.uid));

  const board = buildGroupBoard(statSnap.data() as ScopeStatsDoc | undefined, current, names, uid);
  return NextResponse.json({ periodKey, ...board });
}
