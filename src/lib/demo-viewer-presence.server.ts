/**
 * Demo users "live" on the map — for a registered VIEWER only (demo-users-design.md PR 5).
 *
 * The life engine writes presence/{demo uid} with mode:'group' and the demo groups as the
 * audience (never verified_global), so no real map query returns them. The viewer reads them
 * here instead: one Admin-SDK query (mode=='group' + audienceGroupIds array-contains-any the
 * demo groups, ≤ 10; index presence mode + audienceGroupIds), demo uids only, fresh only
 * (≤ STALE_MS), only the marker fields. A non-viewer gets [] without any presence read.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { isDemoUid } from './demo';
import { resolveDemoViewerWorld } from './demo-viewer-world.server';

export const DEMO_PRESENCE_STALE_MS = 5 * 60_000;
const MAX_MARKERS = 60;

export interface DemoPresenceMarker {
  uid: string;
  name: string;
  lat: number;
  lng: number;
  updatedAtMs: number;
  gender: 'male' | 'female' | null;
  activity: { status?: string; workoutTitle?: string; startedAt?: number } | null;
}

const msOf = (v: unknown): number => {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis(): number }).toMillis();
  if (v instanceof Date) return v.getTime();
  return typeof v === 'number' ? v : 0;
};

/** Pure: a presence doc → a viewer marker (null = not demo / stale / malformed). */
export function toDemoPresenceMarker(id: string, d: Record<string, unknown>, nowMs: number): DemoPresenceMarker | null {
  if (!isDemoUid(id) || d.isDemo !== true) return null;
  if (typeof d.lat !== 'number' || typeof d.lng !== 'number' || !Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return null;
  const updatedAtMs = msOf(d.updatedAt);
  if (!updatedAtMs || nowMs - updatedAtMs > DEMO_PRESENCE_STALE_MS) return null;
  const a = d.activity && typeof d.activity === 'object' ? (d.activity as Record<string, unknown>) : null;
  return {
    uid: id,
    name: typeof d.name === 'string' ? d.name : '',
    lat: d.lat,
    lng: d.lng,
    updatedAtMs,
    gender: d.gender === 'male' || d.gender === 'female' ? d.gender : null,
    activity: a
      ? {
          status: typeof a.status === 'string' ? a.status : undefined,
          workoutTitle: typeof a.workoutTitle === 'string' ? a.workoutTitle : undefined,
          startedAt: typeof a.startedAt === 'number' ? a.startedAt : undefined,
        }
      : null,
  };
}

export async function getDemoPresenceForViewer(db: Firestore, uid: string, nowMs = Date.now()): Promise<DemoPresenceMarker[]> {
  const world = await resolveDemoViewerWorld(db, uid);
  const groupIds = (world?.groupIds ?? []).slice(0, 10);
  if (!groupIds.length) return [];
  try {
    const snap = await db
      .collection('presence')
      .where('mode', '==', 'group')
      .where('audienceGroupIds', 'array-contains-any', groupIds)
      .limit(MAX_MARKERS * 2)
      .get();
    return snap.docs
      .map((d) => toDemoPresenceMarker(d.id, d.data(), nowMs))
      .filter((m): m is DemoPresenceMarker => !!m)
      .slice(0, MAX_MARKERS);
  } catch (err) {
    console.warn('[demo-viewer-presence] read failed', err);
    return [];
  }
}
