/**
 * /api/demo/viewer-presence markers → the presence-doc shape the partner finder
 * maps (usePartnerData `live`). Pure; drops anything that is not a demo uid
 * with finite coordinates, so a bad payload can never put a real user on the map.
 */
import { isDemoUid } from '@/lib/demo';
import type { RawPresenceDoc } from '@/lib/nearbyPresence.service';

export function demoMarkersToPresenceDocs(markers: unknown): RawPresenceDoc[] {
  if (!Array.isArray(markers)) return [];
  const out: RawPresenceDoc[] = [];
  for (const m of markers.slice(0, 60)) {
    if (!m || typeof m !== 'object') continue;
    const x = m as Record<string, unknown>;
    if (!isDemoUid(x.uid) || typeof x.lat !== 'number' || typeof x.lng !== 'number') continue;
    if (!Number.isFinite(x.lat) || !Number.isFinite(x.lng)) continue;
    out.push({
      uid: x.uid as string,
      name: typeof x.name === 'string' ? x.name : '',
      lat: x.lat,
      lng: x.lng,
      mode: 'group',
      isDemo: true,
      ...(x.gender === 'male' || x.gender === 'female' ? { gender: x.gender } : {}),
      ...(x.activity && typeof x.activity === 'object' ? { activity: x.activity } : {}),
    });
  }
  return out;
}

/** The viewer's demo docs bypass the radius gate (their demo city is "home"). */
export function keepLivePartner(p: { uid: string; distanceKm: number }, radiusKm: number, hasUserPos: boolean): boolean {
  return !hasUserPos || p.distanceKm <= radiusKm || isDemoUid(p.uid);
}
