/**
 * Pillar 7 — Municipal Pressure Analytics
 *
 * Tracks user clicks on the "Contact City" CTA in the League view.
 *
 * Firestore writes:
 *   authorities/{id}.pressureCount  — increment(1)
 *   authorities/{id}/pressure_logs  — { uid, timestamp, platform }
 *
 * 24h dedup: stores the last pressure timestamp per authority in localStorage.
 */

import {
  doc,
  collection,
  addDoc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

type PressurePlatform = 'whatsapp' | 'email' | 'link' | 'share';

const DEDUP_PREFIX = 'pressure_last_';
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function canPressure(authorityId: string): boolean {
  try {
    const key = `${DEDUP_PREFIX}${authorityId}`;
    const last = localStorage.getItem(key);
    if (!last) return true;
    return Date.now() - parseInt(last, 10) > DEDUP_WINDOW_MS;
  } catch {
    return true;
  }
}

function markPressured(authorityId: string): void {
  try {
    localStorage.setItem(`${DEDUP_PREFIX}${authorityId}`, String(Date.now()));
  } catch { /* noop */ }
}

/**
 * Log a pressure event on an authority.
 * Returns false if deduplicated (already pressed within 24h).
 */
export async function logMunicipalPressure(
  authorityId: string,
  uid: string,
  platform: PressurePlatform,
): Promise<boolean> {
  if (!canPressure(authorityId)) return false;

  const authorityRef = doc(db, 'authorities', authorityId);

  await Promise.all([
    updateDoc(authorityRef, {
      pressureCount: increment(1),
    }),
    addDoc(collection(db, 'authorities', authorityId, 'pressure_logs'), {
      uid,
      timestamp: serverTimestamp(),
      platform,
    }),
  ]);

  markPressured(authorityId);
  return true;
}

// ─── Admin reads ──────────────────────────────────────────────────────────────

export interface PressureLogEntry {
  id: string;
  uid: string;
  timestamp: Date;
  platform: PressurePlatform;
}

/**
 * Fetch pressure logs for the last N days (admin analytics).
 */
export async function getPressureLogs(
  authorityId: string,
  days = 30,
): Promise<PressureLogEntry[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const q = query(
    collection(db, 'authorities', authorityId, 'pressure_logs'),
    where('timestamp', '>=', cutoff),
    orderBy('timestamp', 'desc'),
    limit(500),
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.timestamp;
    return {
      id: d.id,
      uid: data.uid as string,
      timestamp: ts instanceof Timestamp ? ts.toDate() : new Date(ts),
      platform: data.platform as PressurePlatform,
    };
  });
}

/**
 * Group pressure logs by day for a simple 30-day chart.
 */
export function groupLogsByDay(logs: PressureLogEntry[]): { date: string; count: number }[] {
  const map = new Map<string, number>();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    map.set(key, 0);
  }

  for (const log of logs) {
    const key = log.timestamp.toISOString().slice(0, 10);
    if (map.has(key)) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }

  return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
}
