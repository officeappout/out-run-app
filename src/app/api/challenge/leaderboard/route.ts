/**
 * GET /api/challenge/leaderboard?groupId=<id>&limit=<n>
 *
 * Public (no auth required) — reads challenge_submissions via Admin SDK.
 * Returns top-N sorted by bestValue descending (raw seconds, not activityCredit).
 *
 * Used by:
 *  - /challenge/[inviteCode]/done  — to show the user's rank after completing
 *  - /booth/display                — plasma screen, polled every 8 s
 *
 * No rate-limit: Admin SDK only, read-only, no sensitive user data exposed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface LeaderboardRow {
  rank: number;
  uid: string;
  name: string;
  ageGroup: string;
  gender: string;
  bestValue: number;       // raw seconds
  displayTime: string;     // "1:12" or "47s"
}

function formatSeconds(s: number): string {
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  return `${s}s`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const groupId = searchParams.get('groupId');
    const limitParam = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50);
    const genderFilter = searchParams.get('gender'); // 'male' | 'female' | 'other' | null=all

    if (!groupId) {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 });
    }

    const db = getAdminDb();
    const collRef = db.collection(`community_groups/${groupId}/challenge_submissions`);

    let rows: LeaderboardRow[];
    let total: number;

    if (genderFilter) {
      // Firestore requires a composite index for .where().orderBy() on different fields.
      // That index may not exist yet, so we fetch all docs for this gender without orderBy
      // and sort client-side. For event-scale datasets (≤500 participants) this is fine.
      const genderSnap = await collRef.where('gender', '==', genderFilter).get();
      const sorted = genderSnap.docs
        .slice()
        .sort((a, b) => (b.data().bestValue ?? 0) - (a.data().bestValue ?? 0))
        .slice(0, limitParam);

      rows = sorted.map((doc, idx) => {
        const d = doc.data();
        return {
          rank: idx + 1,
          uid: doc.id,
          name: d.name ?? 'משתתף',
          ageGroup: d.ageGroup ?? 'adult',
          gender: d.gender ?? 'other',
          bestValue: d.bestValue ?? 0,
          displayTime: formatSeconds(d.bestValue ?? 0),
        };
      });
      total = genderSnap.size;
    } else {
      const snap = await collRef.orderBy('bestValue', 'desc').limit(limitParam).get();
      rows = snap.docs.map((doc, idx) => {
        const d = doc.data();
        return {
          rank: idx + 1,
          uid: doc.id,
          name: d.name ?? 'משתתף',
          ageGroup: d.ageGroup ?? 'adult',
          gender: d.gender ?? 'other',
          bestValue: d.bestValue ?? 0,
          displayTime: formatSeconds(d.bestValue ?? 0),
        };
      });
      const totalSnap = await collRef.count().get();
      total = totalSnap.data().count;
    }

    return NextResponse.json({ ok: true, rows, total });
  } catch (err) {
    console.error('[challenge/leaderboard] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
