/**
 * Segregation Service — Safe-City Map visibility logic.
 *
 * CRITICAL SAFETY INVARIANT:
 *   Minors NEVER see adults.  Adults NEVER see minors.
 *   This is enforced at the query level (Firestore `where`) AND
 *   at the client filter level (double-check after fetch).
 *
 * Visibility matrix (within the same age group):
 * ┌─────────────────────┬───────────────────────────────────────────────┐
 * │ Viewer              │ Sees                                          │
 * ├─────────────────────┼───────────────────────────────────────────────┤
 * │ Ghost mode          │ Nobody (user is also invisible)               │
 * │ Squad mode          │ Only users in their `following` list          │
 * │ Verified Global     │ All other `verified_global` users             │
 * │                     │ + all `squad` users in their following list   │
 * └─────────────────────┴───────────────────────────────────────────────┘
 *
 * Firestore queries:
 *   1. `verified_global` viewers:
 *      query(presence, where ageGroup == myAgeGroup, where mode == 'verified_global')
 *      + query(presence, where uid in [following…])  → then filter ageGroup client-side
 *
 *   2. `squad` viewers:
 *      query(presence, where uid in [following…])  → filter ageGroup client-side
 *
 *   3. `ghost` viewers:
 *      → empty set (no query needed)
 */

import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

import type { PresenceActivity } from './presence.service';

export interface PresenceMarker {
  uid: string;
  name: string;
  ageGroup: 'minor' | 'adult';
  isVerified: boolean;
  schoolName: string | null;
  lat: number;
  lng: number;
  updatedAt: Date;
  activity?: PresenceActivity;
  lemurStage?: number;
  level?: number;
  programId?: string;
  personaId?: string;
  photoURL?: string;
}

// Staleness threshold: ignore presence older than 5 minutes
const STALE_MS = 5 * 60 * 1000;

function isStale(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() > STALE_MS;
}

function toPresenceMarker(data: Record<string, unknown>, id: string): PresenceMarker | null {
  const updatedAt =
    data.updatedAt instanceof Timestamp
      ? data.updatedAt.toDate()
      : new Date(data.updatedAt as string);

  if (isStale(updatedAt)) return null;

  return {
    uid: id,
    name: (data.name as string) ?? '',
    ageGroup: (data.ageGroup as 'minor' | 'adult') ?? 'adult',
    isVerified: (data.isVerified as boolean) ?? false,
    schoolName: (data.schoolName as string) ?? null,
    lat: data.lat as number,
    lng: data.lng as number,
    updatedAt,
    activity: data.activity as PresenceActivity | undefined,
    lemurStage: data.lemurStage as number | undefined,
    level: data.level as number | undefined,
    programId: data.programId as string | undefined,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Core query
// ────────────────────────────────────────────────────────────────────────────

export interface VisibilityParams {
  myUid: string;
  myAgeGroup: 'minor' | 'adult';
  myMode: 'ghost' | 'squad' | 'verified_global';
  following: string[];
}

export async function getVisiblePresence(
  params: VisibilityParams,
): Promise<PresenceMarker[]> {
  const { myUid, myAgeGroup, myMode, following } = params;

  // Ghost users see nobody
  if (myMode === 'ghost') return [];

  const markers: Map<string, PresenceMarker> = new Map();

  // ── 1. Squad layer: users I follow (in my age group) ────────────────
  if (following.length > 0) {
    // Firestore `in` supports up to 30 values
    const batches: string[][] = [];
    for (let i = 0; i < following.length; i += 30) {
      batches.push(following.slice(i, i + 30));
    }

    for (const batch of batches) {
      const q = query(
        collection(db, 'presence'),
        where('uid', 'in', batch),
      );
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const m = toPresenceMarker(d.data(), d.id);
        // CRITICAL: enforce age-group segregation client-side
        if (m && m.ageGroup === myAgeGroup && m.uid !== myUid) {
          markers.set(m.uid, m);
        }
      });
    }
  }

  // ── 2. Verified Global layer: all verified_global users in my age group ─
  if (myMode === 'verified_global') {
    const q = query(
      collection(db, 'presence'),
      where('ageGroup', '==', myAgeGroup),
      where('mode', '==', 'verified_global'),
    );
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const m = toPresenceMarker(d.data(), d.id);
      if (m && m.uid !== myUid) {
        markers.set(m.uid, m);
      }
    });
  }

  return Array.from(markers.values());
}

// ────────────────────────────────────────────────────────────────────────────
// Heatmap data — anonymous aggregate per authority
// Fetches all non-ghost presence docs for the user's age group and returns
// raw coordinate arrays for heatmap rendering. No names or UIDs are exposed.
// ────────────────────────────────────────────────────────────────────────────

export interface HeatmapPoint {
  lat: number;
  lng: number;
  weight: number;
}

export async function getHeatmapData(
  ageGroup: 'minor' | 'adult',
  authorityId?: string,
): Promise<HeatmapPoint[]> {
  const constraints = [
    where('ageGroup', '==', ageGroup),
  ];

  if (authorityId) {
    constraints.push(where('authorityId', '==', authorityId));
  }

  const q = query(collection(db, 'presence'), ...constraints);
  const snap = await getDocs(q);
  const points: HeatmapPoint[] = [];

  snap.forEach((d) => {
    const data = d.data();
    const updatedAt =
      data.updatedAt instanceof Timestamp
        ? data.updatedAt.toDate()
        : new Date(data.updatedAt as string);

    if (!isStale(updatedAt) && data.mode !== 'ghost') {
      points.push({ lat: data.lat, lng: data.lng, weight: 1 });
    }
  });

  return points;
}
