/**
 * Kelly round 4 — find_nearby_parks (read-only, Admin SDK). Server only.
 *
 * Reads the published parks (same "published" rule as /api/catalog/parks: `published`, else
 * contentStatus === 'published') with only the fields it needs, and the gym_equipment catalog,
 * both cached per server instance for PARKS_TTL_MS. Nothing is written.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { classifyGear, parksToolResult, rankNearbyParks, type GearGroup, type ParkCandidate } from './parks-rank';
import type { FindNearbyParksInputT } from './tool-specs';
import type { ParkCardView } from './types';
import { readUserOrigin } from './location.server';

const PARKS_TTL_MS = 10 * 60_000;
let cache: { at: number; parks: ParkCandidate[] } | null = null;

const isPublished = (d: Record<string, unknown>) => (typeof d.published === 'boolean' ? d.published : d.contentStatus === 'published');

export async function loadParkCandidates(db: Firestore, nowMs = Date.now()): Promise<ParkCandidate[]> {
  if (cache && nowMs - cache.at < PARKS_TTL_MS) return cache.parks;
  const [parksSnap, gearSnap] = await Promise.all([
    db.collection('parks').select('name', 'location', 'published', 'contentStatus', 'gymEquipment', 'neighborhoodName', 'city').get(),
    db.collection('gym_equipment').select('name', 'iconKey', 'isFunctional').get(),
  ]);
  const groupOf = new Map<string, GearGroup | null>();
  for (const g of gearSnap.docs) groupOf.set(g.id, classifyGear(g.data()));
  const parks: ParkCandidate[] = [];
  for (const doc of parksSnap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const loc = d.location as { lat?: unknown; lng?: unknown } | undefined;
    if (!isPublished(d) || typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number' || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
    const eq = Array.isArray(d.gymEquipment) ? (d.gymEquipment as Array<{ equipmentId?: unknown }>) : [];
    const groups = Array.from(new Set(eq.map((e) => (typeof e?.equipmentId === 'string' ? groupOf.get(e.equipmentId) : null)).filter((g): g is GearGroup => !!g)));
    if (groups.length === 0) continue;
    const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim() : null;
    if (!name) continue;
    const area = typeof d.neighborhoodName === 'string' && d.neighborhoodName ? d.neighborhoodName : typeof d.city === 'string' && d.city ? d.city : null;
    parks.push({ id: doc.id, name, lat: loc.lat, lng: loc.lng, groups, area });
  }
  cache = { at: nowMs, parks };
  return parks;
}

export async function findNearbyParks(
  ctx: { db: Firestore; uid: string; profile: Record<string, unknown>; now: Date },
  input: FindNearbyParksInputT,
): Promise<{ result: Record<string, unknown>; parks: ParkCardView[] }> {
  const origin = await readUserOrigin(ctx.db, ctx.uid, ctx.profile, ctx.now);
  if (!origin) return { result: parksToolResult([], null), parks: [] };
  const parks = rankNearbyParks(await loadParkCandidates(ctx.db, ctx.now.getTime()), origin, input.focus);
  return { result: parksToolResult(parks, origin.kind), parks };
}
