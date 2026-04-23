/**
 * Leaderboard Service — reads from pre-computed leaderboard_snapshots.
 *
 * Snapshots are written by the rollupLeaderboard Cloud Function (nightly).
 * This eliminates the need for heavy client-side getDocs on feed_posts.
 *
 * Snapshot doc schema — leaderboard_snapshots/{tenantId}_{unitId}_{period}:
 * {
 *   period:             string,         // e.g. "2026-04"
 *   rankings:           RankedUser[],   // sorted by XP desc
 *   totalParticipants:  number,
 *   rolledUpAt:         Timestamp,
 * }
 */

import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────

export interface RankedUser {
  uid: string;
  rank: number;
  xp: number;
  posts: number;
}

export interface LeaderboardSnapshot {
  period: string;
  rankings: RankedUser[];
  totalParticipants: number;
  rolledUpAt: any;
}

export interface EnrichedRankedUser extends RankedUser {
  name: string;
  avatarUrl?: string;
}

// ── Fetch Snapshot ────────────────────────────────────────────────────

function getCurrentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Get the leaderboard snapshot for a specific tenant+unit+period.
 * Falls back to '_global' tenant and '_all' unit if not specified.
 */
export async function getLeaderboard(
  tenantId?: string,
  unitId?: string,
  period?: string,
): Promise<LeaderboardSnapshot | null> {
  const t = tenantId ?? '_global';
  const u = unitId ?? '_all';
  const p = period ?? getCurrentPeriod();
  const docId = `${t}_${u}_${p}`;

  const snap = await getDoc(doc(db, 'leaderboard_snapshots', docId));
  if (!snap.exists()) return null;

  return snap.data() as LeaderboardSnapshot;
}

/**
 * Enrich ranked users with display names from Firestore user docs.
 * Batches reads to minimize round-trips (max 10 per batch due to `in` query limit).
 */
export async function enrichRankings(
  rankings: RankedUser[],
  limit = 50,
): Promise<EnrichedRankedUser[]> {
  const topUsers = rankings.slice(0, limit);
  if (topUsers.length === 0) return [];

  const nameMap = new Map<string, { name: string; avatarUrl?: string }>();

  // Firestore `in` queries are limited to 30 elements
  const CHUNK = 30;
  for (let i = 0; i < topUsers.length; i += CHUNK) {
    const chunk = topUsers.slice(i, i + CHUNK);
    const uids = chunk.map(u => u.uid);

    const usersSnap = await getDocs(query(
      collection(db, 'users'),
      where('__name__', 'in', uids),
    ));

    for (const userDoc of usersSnap.docs) {
      const core = (userDoc.data().core ?? {}) as Record<string, any>;
      nameMap.set(userDoc.id, {
        name: core.name ?? 'ללא שם',
        avatarUrl: core.avatarUrl ?? undefined,
      });
    }
  }

  return topUsers.map(u => ({
    ...u,
    name: nameMap.get(u.uid)?.name ?? 'ללא שם',
    avatarUrl: nameMap.get(u.uid)?.avatarUrl,
  }));
}

/**
 * Get the current user's rank from a snapshot.
 */
export function getUserRank(
  snapshot: LeaderboardSnapshot,
  uid: string,
): RankedUser | null {
  return snapshot.rankings.find(r => r.uid === uid) ?? null;
}

/**
 * Get available periods (recent months) for a leaderboard selector.
 */
export function getRecentPeriods(count = 6): { value: string; label: string }[] {
  const periods: { value: string; label: string }[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const value = `${y}-${m}`;
    const label = d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    periods.push({ value, label });
  }

  return periods;
}
