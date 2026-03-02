/**
 * Ranking Service — real Firestore leaderboards for The League (הליגה).
 *
 * Aggregates `activityCredit` from the `feed_posts` collection,
 * grouped by author, filtered by scope, category, time window, and age group.
 */

import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types ──────────────────────────────────────────────────────────────

export type LeaderboardScope = 'city' | 'school' | 'park';
export type LeaderboardCategory = 'overall' | 'cardio' | 'strength';
export type LeaderboardTimeWindow = 'weekly' | 'monthly';

export interface LeaderboardEntry {
  rank: number;
  uid: string;
  name: string;
  totalCredit: number;
  workoutCount: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  myEntry: LeaderboardEntry | null;
  totalParticipants: number;
  window: LeaderboardTimeWindow;
  generatedAt: Date;
}

// ── Time helpers ───────────────────────────────────────────────────────

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // distance to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

export function getWindowStart(window: LeaderboardTimeWindow): Date {
  return window === 'weekly' ? getWeekStart() : getMonthStart();
}

// ── Core query ─────────────────────────────────────────────────────────

export async function getLeaderboard(params: {
  scope: LeaderboardScope;
  scopeId: string;
  category: LeaderboardCategory;
  timeWindow: LeaderboardTimeWindow;
  ageGroup: 'minor' | 'adult';
  currentUid: string;
  currentName?: string;
  maxEntries?: number;
}): Promise<LeaderboardResult> {
  const { scope, scopeId, category, timeWindow, ageGroup, currentUid, currentName, maxEntries = 50 } = params;
  const windowStart = Timestamp.fromDate(getWindowStart(timeWindow));

  const scopeField =
    scope === 'city' ? 'authorityId' :
    scope === 'school' ? 'schoolId' :
    'parkId';

  const constraints = [
    where(scopeField, '==', scopeId),
    where('ageGroup', '==', ageGroup),
    where('createdAt', '>=', windowStart),
  ];

  if (category !== 'overall') {
    constraints.push(where('activityCategory', '==', category));
  }

  const q = query(collection(db, 'feed_posts'), ...constraints);
  const snap = await getDocs(q);

  // Aggregate credit + workout count per user
  const creditMap = new Map<string, { name: string; total: number; count: number }>();

  snap.forEach((d) => {
    const data = d.data();
    const uid = data.authorUid as string;
    const credit = (data.activityCredit as number) || 0;
    const name = (data.authorName as string) || '???';

    const existing = creditMap.get(uid);
    if (existing) {
      existing.total += credit;
      existing.count += 1;
    } else {
      creditMap.set(uid, { name, total: credit, count: 1 });
    }
  });

  // Sort descending by total credit
  const allSorted = Array.from(creditMap.entries())
    .sort(([, a], [, b]) => b.total - a.total);

  const totalParticipants = allSorted.length;

  const sorted = allSorted.slice(0, maxEntries);

  const entries: LeaderboardEntry[] = sorted.map(([uid, { name, total, count }], idx) => ({
    rank: idx + 1,
    uid,
    name,
    totalCredit: total,
    workoutCount: count,
    isCurrentUser: uid === currentUid,
  }));

  let myEntry = entries.find((e) => e.isCurrentUser) ?? null;

  // If the current user isn't in the top N, add them with their real rank
  if (!myEntry && currentUid) {
    const myIdx = allSorted.findIndex(([uid]) => uid === currentUid);
    if (myIdx >= 0) {
      const [, { name, total, count }] = allSorted[myIdx];
      myEntry = { rank: myIdx + 1, uid: currentUid, name, totalCredit: total, workoutCount: count, isCurrentUser: true };
    } else {
      myEntry = {
        rank: totalParticipants + 1,
        uid: currentUid,
        name: currentName ?? 'את/ה',
        totalCredit: 0,
        workoutCount: 0,
        isCurrentUser: true,
      };
    }
  }

  return { entries, myEntry, totalParticipants, window: timeWindow, generatedAt: new Date() };
}
