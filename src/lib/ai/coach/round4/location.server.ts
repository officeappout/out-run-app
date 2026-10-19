/**
 * Kelly round 4 — where the user usually is, for the read-only nearby tools. Server only.
 *
 *   recent     userLocations/{uid} (written by the app at most every 5 minutes while home or
 *              the map has a GPS fix), when updated in the last RECENT_DAYS
 *   home_area  users.core.anchorLat/Lng (the neighbourhood anchor saved at location confirm)
 *   city       the user's authority centre (authorities/{id}.coordinates)
 *
 * Coordinates never leave the server: tools return distances and names only, and nothing
 * here is logged.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';

export type OriginKind = 'recent' | 'home_area' | 'city';
export interface UserOrigin {
  lat: number;
  lng: number;
  kind: OriginKind;
}

export const RECENT_DAYS = 14;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function msOf(v: unknown): number | null {
  if (!v) return null;
  const t = v as { toMillis?: () => number };
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return null;
}

export async function readUserOrigin(
  db: Firestore,
  uid: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore profile, read through field guards
  profile: Record<string, any>,
  now: Date,
): Promise<UserOrigin | null> {
  try {
    const snap = await db.collection('userLocations').doc(uid).get();
    const d = snap.exists ? snap.data() : null;
    const at = msOf(d?.updatedAt);
    if (d && finite(d.lat) && finite(d.lng) && at !== null && now.getTime() - at <= RECENT_DAYS * 86_400_000) {
      return { lat: d.lat, lng: d.lng, kind: 'recent' };
    }
  } catch {
    /* fall through to the anchor */
  }
  const core = profile?.core ?? {};
  if (finite(core.anchorLat) && finite(core.anchorLng)) return { lat: core.anchorLat, lng: core.anchorLng, kind: 'home_area' };
  const authorityId = typeof core.authorityId === 'string' && core.authorityId ? core.authorityId : null;
  if (authorityId) {
    try {
      const a = await db.collection('authorities').doc(authorityId).get();
      const c = a.data()?.coordinates;
      if (c && finite(c.lat) && finite(c.lng)) return { lat: c.lat, lng: c.lng, kind: 'city' };
    } catch {
      /* no area */
    }
  }
  return null;
}
