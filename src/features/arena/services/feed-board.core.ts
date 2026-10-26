/**
 * feed-board.core — the six feed_posts leaderboards (credit, distance, run segment, group league,
 * group-vs-group, scope-vs-scope) as ONE pure engine: the query each one runs + its aggregation,
 * moved verbatim out of ranking.service (rules-prep, 26.10). Runs on the server
 * (/api/leagues/feed-board, Admin SDK) behind the `FeedBoardReader` port, so feed_posts never has
 * to be client-listable — the precondition for the mutual-follow 'partners' rule (PR #826).
 * No Firebase import here; parity with the old client code is pinned by feed-board-parity.test.ts.
 */
import { isDemoDoc, isDemoTenantId } from '@/lib/demo';
import { scopeToField, type LeaderboardCategory, type LeaderboardGenderFilter, type LeaderboardScope, type LeaderboardTimeWindow } from './leaderboard-scope';

export type FeedBoardKind = 'credit' | 'distance' | 'segment' | 'league' | 'groupCompetition' | 'scopeCompetition';
export const FEED_BOARD_KINDS: readonly FeedBoardKind[] = ['credit', 'distance', 'segment', 'league', 'groupCompetition', 'scopeCompetition'];

/** One board request. `since` = the window start the CLIENT computed (its local time zone, as before). */
export interface FeedBoardRequest {
  kind: FeedBoardKind;
  since?: string | null;
  timeWindow?: LeaderboardTimeWindow;
  scope?: LeaderboardScope | 'city' | 'school' | 'global';
  scopeId?: string | null;
  category?: LeaderboardCategory;
  ageGroup?: 'minor' | 'adult';
  genderFilter?: LeaderboardGenderFilter;
  programId?: string | null;
  runSegment?: '3k' | '5k' | '10k';
  groupId?: string;
  granularity?: 'city' | 'neighborhood';
  cityAuthorityId?: string | null;
  /** Sent by the client for its own convenience; the server ignores it (the verified caller is the current user). */
  currentUid?: string;
  currentName?: string;
  maxEntries?: number;
}

export type Op = '==' | '>=' | 'array-contains';
export interface PostQuery {
  filters: Array<[string, Op, unknown]>;
  /** orderBy('createdAt', 'desc') — pins the index direction (and the segment board's newest-500). */
  orderCreatedDesc: boolean;
  limit: number | null;
}

export interface FeedDoc { id: string; data: Record<string, unknown> }

/** The reads the engine needs — Admin SDK on the server, in-memory in tests. */
export interface FeedBoardReader {
  posts(q: PostQuery): Promise<FeedDoc[]>;
  /** Docs by id (missing → undefined data). */
  docs(collection: 'community_groups' | 'authorities', ids: string[]): Promise<Map<string, Record<string, unknown> | undefined>>;
}

export interface LeaderboardEntry { rank: number; uid: string; name: string; totalCredit: number; workoutCount: number; isCurrentUser: boolean }
export interface LeaderboardResult { entries: LeaderboardEntry[]; myEntry: LeaderboardEntry | null; totalParticipants: number; window: LeaderboardTimeWindow; generatedAt: Date }
export interface GroupCompetitionEntry { rank: number; groupId: string; groupName: string; totalScore: number; avgScore: number; activeMemberCount: number }
export interface GroupCompetitionResult { entries: GroupCompetitionEntry[]; generatedAt: Date }
export interface ScopeCompetitionEntry { rank: number; scopeId: string; scopeName: string; totalScore: number; activeMemberCount: number; totalKm?: number; kmPerMember?: number }
export interface ScopeCompetitionResult { entries: ScopeCompetitionEntry[]; generatedAt: Date }
export type FeedBoardResult = LeaderboardResult | GroupCompetitionResult | ScopeCompetitionResult;

const ME_FALLBACK = 'אני'; // i18n-allow-hebrew: moved verbatim from ranking.service (display fallback, extracted with the arena screens)

/** The query each board ran on the client, unchanged. */
export function buildPostQuery(req: FeedBoardRequest): PostQuery {
  const since = req.since ? new Date(req.since) : null;
  const f: Array<[string, Op, unknown]> = [];
  const gender = req.genderFilter ?? 'all';
  const category = req.category ?? 'overall';
  switch (req.kind) {
    case 'credit': {
      f.push(['ageGroup', '==', req.ageGroup], ['createdAt', '>=', since]);
      const field = scopeToField(req.scope as LeaderboardScope);
      if (field && req.scopeId) f.push([field, '==', req.scopeId]);
      if (category !== 'overall') f.push(['activityCategory', '==', category]);
      if (gender !== 'all') f.push(['gender', '==', gender]);
      if (req.programId) f.push(['programId', '==', req.programId]);
      return { filters: f, orderCreatedDesc: false, limit: null };
    }
    case 'distance': {
      f.push(['ageGroup', '==', req.ageGroup], ['createdAt', '>=', since], ['activityCategory', '==', 'cardio']);
      const field = scopeToField(req.scope as LeaderboardScope);
      if (field && req.scopeId) f.push([field, '==', req.scopeId]);
      if (gender !== 'all') f.push(['gender', '==', gender]);
      return { filters: f, orderCreatedDesc: false, limit: null };
    }
    case 'segment': {
      f.push(['ageGroup', '==', req.ageGroup ?? 'adult'], ['runSegment', '==', req.runSegment]);
      const field = scopeToField(req.scope as LeaderboardScope);
      if (field && req.scopeId) f.push([field, '==', req.scopeId]);
      if (gender !== 'all') f.push(['gender', '==', gender]);
      // Fetch recent runs first; 500 is plenty to find per-user PBs
      return { filters: f, orderCreatedDesc: true, limit: 500 };
    }
    case 'league': {
      f.push(['groupIds', 'array-contains', req.groupId], ['createdAt', '>=', since]);
      if (category !== 'overall') f.push(['activityCategory', '==', category]);
      if (gender !== 'all') f.push(['gender', '==', gender]);
      return { filters: f, orderCreatedDesc: false, limit: null };
    }
    case 'groupCompetition': {
      f.push(['createdAt', '>=', since]);
      if (req.scope !== 'global' && req.scopeId) f.push([req.scope === 'city' ? 'authorityId' : 'schoolId', '==', req.scopeId]);
      if (gender !== 'all') f.push(['gender', '==', gender]);
      return { filters: f, orderCreatedDesc: true, limit: null };
    }
    case 'scopeCompetition': {
      f.push(['createdAt', '>=', since]);
      if (req.granularity === 'neighborhood' && req.cityAuthorityId) f.push(['authorityId', '==', req.cityAuthorityId]);
      if (category !== 'overall') f.push(['activityCategory', '==', category]);
      if (gender !== 'all') f.push(['gender', '==', gender]);
      return { filters: f, orderCreatedDesc: true, limit: null };
    }
  }
}

/** Newest first + the limit — what Firestore does for the ordered / limited queries (a no-op on real results). */
function applyOrderAndLimit(docs: FeedDoc[], q: PostQuery): FeedDoc[] {
  if (!q.orderCreatedDesc && q.limit == null) return docs;
  const ms = (v: unknown) => (v instanceof Date ? v.getTime() : typeof (v as { toMillis?: unknown })?.toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : new Date(v as string).getTime());
  const sorted = q.orderCreatedDesc ? docs.slice().sort((a, b) => ms(b.data.createdAt) - ms(a.data.createdAt)) : docs;
  return q.limit != null ? sorted.slice(0, q.limit) : sorted;
}

type Agg = { name: string; total: number; count: number };

function rankIndividuals(
  allSorted: Array<readonly [string, Agg]>,
  currentUid: string,
  currentName: string | undefined,
  maxEntries: number,
  window: LeaderboardTimeWindow,
): LeaderboardResult {
  const totalParticipants = allSorted.length;
  const entries: LeaderboardEntry[] = allSorted.slice(0, maxEntries).map(([uid, { name, total, count }], idx) => ({
    rank: idx + 1, uid, name, totalCredit: total, workoutCount: count, isCurrentUser: uid === currentUid,
  }));
  let myEntry = entries.find((e) => e.isCurrentUser) ?? null;
  if (!myEntry && currentUid) {
    const myIdx = allSorted.findIndex(([uid]) => uid === currentUid);
    if (myIdx >= 0) {
      const [, { name, total, count }] = allSorted[myIdx];
      myEntry = { rank: myIdx + 1, uid: currentUid, name, totalCredit: total, workoutCount: count, isCurrentUser: true };
    } else {
      myEntry = { rank: totalParticipants + 1, uid: currentUid, name: currentName ?? ME_FALLBACK, totalCredit: 0, workoutCount: 0, isCurrentUser: true };
    }
  }
  return { entries, myEntry, totalParticipants, window, generatedAt: new Date() };
}

function sumCredit(docs: FeedDoc[]): Map<string, Agg> {
  const m = new Map<string, Agg>();
  for (const { data } of docs) {
    const uid = data.authorUid as string;
    const credit = (data.activityCredit as number) || 0;
    const name = (data.authorName as string) || '???';
    const e = m.get(uid);
    if (e) { e.total += credit; e.count += 1; } else m.set(uid, { name, total: credit, count: 1 });
  }
  return m;
}

/** Runs one board: its query through the reader, then the original aggregation. `currentUid` = the verified caller. */
export async function runFeedBoard(req: FeedBoardRequest, reader: FeedBoardReader, currentUid: string): Promise<FeedBoardResult> {
  const q = buildPostQuery(req);
  const docs = applyOrderAndLimit(await reader.posts(q), q);
  const max = req.maxEntries;
  const currentName = req.currentName;

  switch (req.kind) {
    case 'credit':
    case 'league': {
      const allSorted = Array.from(sumCredit(docs).entries()).sort(([, a], [, b]) => b.total - a.total);
      return rankIndividuals(allSorted, currentUid, currentName, max ?? 50, req.timeWindow ?? 'weekly');
    }
    case 'distance': {
      const m = new Map<string, Agg>();
      for (const { data } of docs) {
        const uid = data.authorUid as string;
        const dist = (data.distanceKm as number) || 0;
        if (dist <= 0) continue; // no real distance on this post — skip, don't count as a zero
        const name = (data.authorName as string) || '???';
        const e = m.get(uid);
        if (e) { e.total += dist; e.count += 1; } else m.set(uid, { name, total: dist, count: 1 });
      }
      // Round to 1 decimal (matches FeedPostCard's distanceKm.toFixed(1) display) to avoid float noise.
      const round1 = (n: number) => Math.round(n * 10) / 10;
      const allSorted = Array.from(m.entries())
        .map(([uid, v]) => [uid, { ...v, total: round1(v.total) }] as const)
        .sort(([, a], [, b]) => b.total - a.total);
      return rankIndividuals(allSorted, currentUid, currentName, max ?? 50, req.timeWindow ?? 'weekly');
    }
    case 'segment': {
      const best = new Map<string, { name: string; bestPace: number }>();
      for (const { data } of docs) {
        const uid = data.authorUid as string | undefined;
        const pace = data.paceSecPerKm as number | undefined;
        const name = (data.authorName as string) || (uid === currentUid ? currentName : undefined) || '???';
        if (!uid || !pace || pace <= 0) continue;
        const e = best.get(uid);
        if (!e || pace < e.bestPace) best.set(uid, { name, bestPace: pace });
      }
      // Lower pace = faster = rank 1; pace rides in totalCredit AND workoutCount (as before).
      const allSorted = Array.from(best.entries())
        .sort(([, a], [, b]) => a.bestPace - b.bestPace)
        .map(([uid, { name, bestPace }]) => [uid, { name, total: bestPace, count: bestPace }] as const);
      return rankIndividuals(allSorted, currentUid, currentName, max ?? 50, 'weekly');
    }
    case 'groupCompetition': {
      const groupMap = new Map<string, { totalScore: number; members: Set<string> }>();
      // Demo world guard (21.10.2026): only a demo scope's own board keeps demo posts / groups.
      const keepDemo = req.scope !== 'global' && isDemoTenantId(req.scopeId);
      for (const { id, data } of docs) {
        if (!keepDemo && isDemoDoc(data, id)) continue;
        const gids = (data.groupIds as string[] | undefined)?.filter((g) => keepDemo || !isDemoTenantId(g));
        if (!Array.isArray(gids) || gids.length === 0) continue;
        const credit = (data.activityCredit as number) || 0;
        const uid = data.authorUid as string;
        for (const gid of gids) {
          const e = groupMap.get(gid);
          if (e) { e.totalScore += credit; e.members.add(uid); } else groupMap.set(gid, { totalScore: credit, members: new Set([uid]) });
        }
      }
      if (groupMap.size === 0) return { entries: [], generatedAt: new Date() };
      const groupIds = Array.from(groupMap.keys());
      const meta = await reader.docs('community_groups', groupIds);
      // Ephemeral (single-session invite) groups never rank.
      const entries = groupIds
        .filter((gid) => (meta.get(gid)?.type as string | undefined) !== 'ephemeral')
        .map((gid) => {
          const { totalScore, members } = groupMap.get(gid)!;
          const data = meta.get(gid);
          return {
            groupId: gid,
            groupName: data ? ((data.name as string) ?? gid) : gid,
            totalScore,
            avgScore: Math.round(totalScore / Math.max(members.size, 1)),
            activeMemberCount: members.size,
          };
        })
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, max ?? 20)
        .map((row, idx) => ({ rank: idx + 1, ...row }));
      return { entries, generatedAt: new Date() };
    }
    case 'scopeCompetition': {
      const groupField = scopeToField(req.granularity as LeaderboardScope) as string;
      const scopeMap = new Map<string, { totalScore: number; members: Set<string> }>();
      // Demo world guard: only a demo city's own neighbourhood board keeps demo scopes.
      const keepDemo = req.granularity === 'neighborhood' && isDemoTenantId(req.cityAuthorityId);
      for (const { id, data } of docs) {
        if (!keepDemo && isDemoDoc(data, id)) continue;
        const scopeId = data[groupField] as string | undefined;
        if (!scopeId) continue;
        const credit = (data.activityCredit as number) || 0;
        const uid = data.authorUid as string;
        const e = scopeMap.get(scopeId);
        if (e) { e.totalScore += credit; e.members.add(uid); } else scopeMap.set(scopeId, { totalScore: credit, members: new Set([uid]) });
      }
      if (scopeMap.size === 0) return { entries: [], generatedAt: new Date() };
      const scopeIds = Array.from(scopeMap.keys());
      const names = await reader.docs('authorities', scopeIds);
      const entries = scopeIds
        .map((sid) => {
          const { totalScore, members } = scopeMap.get(sid)!;
          const data = names.get(sid);
          return { scopeId: sid, scopeName: data ? ((data.name as string) ?? sid) : sid, totalScore, activeMemberCount: members.size };
        })
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, max ?? 20)
        .map((row, idx) => ({ rank: idx + 1, ...row }));
      return { entries, generatedAt: new Date() };
    }
  }
}
