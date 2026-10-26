/**
 * GET /api/leagues/feed-board — the six feed_posts leaderboards (credit, distance, run segment,
 * group league, group-vs-group, scope-vs-scope), server-side (rules-prep, 26.10).
 *
 * Same query + aggregation the client ran before (feed-board.core, parity-tested), read with the
 * Admin SDK so feed_posts no longer needs to be client-listable — the precondition for the
 * mutual-follow 'partners' rule in PR #826. The verified caller is the current user (a `currentUid`
 * param is ignored). `since` is the client's own window start (its time zone, as before), bounded
 * to the last 40 days; scans are capped (MAX_POSTS_PER_BOARD) and cached for 60 s.
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FEED_BOARD_KINDS, runFeedBoard, type FeedBoardKind, type FeedBoardRequest } from '@/features/arena/services/feed-board.core';
import { adminFeedBoardReader } from './admin-reader';

export const dynamic = 'force-dynamic';

const MAX_SINCE_AGE_MS = 40 * 24 * 3_600_000;
const WINDOWED: ReadonlySet<FeedBoardKind> = new Set(['credit', 'distance', 'league', 'groupCompetition', 'scopeCompetition']);
const oneOf = <T extends string>(v: string | null, allowed: readonly T[]): T | undefined =>
  v != null && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
const id = (v: string | null) => (v && v.length <= 200 ? v : null);

/** Query string → a validated request, or an error message. */
export function parseFeedBoardRequest(q: URLSearchParams, now = Date.now()): FeedBoardRequest | string {
  const kind = oneOf(q.get('kind'), FEED_BOARD_KINDS);
  if (!kind) return 'bad kind';
  const since = q.get('since');
  if (WINDOWED.has(kind)) {
    const t = since ? Date.parse(since) : NaN;
    if (!Number.isFinite(t) || t > now || now - t > MAX_SINCE_AGE_MS) return 'bad since';
  }
  const max = q.get('maxEntries');
  const maxEntries = max == null ? undefined : Number(max);
  if (maxEntries !== undefined && (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 100)) return 'bad maxEntries';
  return {
    kind,
    since: WINDOWED.has(kind) ? since : null,
    timeWindow: oneOf(q.get('timeWindow'), ['daily', 'weekly', 'monthly'] as const),
    scope: oneOf(q.get('scope'), ['city', 'school', 'park', 'neighborhood', 'global', 'league', 'tenant', 'reserve'] as const),
    scopeId: id(q.get('scopeId')),
    category: oneOf(q.get('category'), ['overall', 'cardio', 'strength'] as const),
    ageGroup: oneOf(q.get('ageGroup'), ['minor', 'adult'] as const),
    genderFilter: oneOf(q.get('genderFilter'), ['all', 'male', 'female'] as const),
    programId: id(q.get('programId')),
    runSegment: oneOf(q.get('runSegment'), ['3k', '5k', '10k'] as const),
    groupId: id(q.get('groupId')) ?? undefined,
    granularity: oneOf(q.get('granularity'), ['city', 'neighborhood'] as const),
    cityAuthorityId: id(q.get('cityAuthorityId')),
    currentName: q.get('currentName')?.slice(0, 120) ?? undefined,
    maxEntries,
  };
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let caller: string;
  try {
    caller = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const parsed = parseFeedBoardRequest(req.nextUrl.searchParams);
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });
  // Same guards the client had before the read (a board missing its required id returns empty there too).
  if ((parsed.kind === 'credit' || parsed.kind === 'distance') && !parsed.ageGroup) return NextResponse.json({ error: 'bad ageGroup' }, { status: 400 });
  if (parsed.kind === 'league' && !parsed.groupId) return NextResponse.json({ error: 'bad groupId' }, { status: 400 });
  if (parsed.kind === 'segment' && !parsed.runSegment) return NextResponse.json({ error: 'bad runSegment' }, { status: 400 });
  if (parsed.kind === 'scopeCompetition' && !parsed.granularity) return NextResponse.json({ error: 'bad granularity' }, { status: 400 });

  const reader = adminFeedBoardReader(getAdminDb());
  const result = await runFeedBoard(parsed, reader, caller);
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'private, max-age=30', ...(reader.truncated ? { 'X-Feed-Board-Truncated': '1' } : {}) },
  });
}
