/**
 * scripts/_verify-launch-day-kalaniyot-stations.ts — URGENT, read-only.
 * Mirrors resolveRouteStops (route-stops.service.ts) against the REAL
 * Kalaniyot route (L3q3SY0UaCeJHdtHUOV7) and REAL Sderot parks.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const ROUTE_ID = 'L3q3SY0UaCeJHdtHUOV7';
const MATCH_RADIUS_M = 180;
const MIN_STOP_GAP_M = 150;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function normalizePath(raw: any): [number, number][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => (Array.isArray(p) ? [p[0], p[1]] : [p?.lng ?? p?.longitude, p?.lat ?? p?.latitude]))
    .filter((c: any) => Number.isFinite(c[0]) && Number.isFinite(c[1])) as [number, number][];
}

function classifyStopRole(d: any): { activityType: string; locationKind: string; cooldownEligible: boolean } | null {
  const facility = d.category ?? d.facilityType;
  const equipped = (d.gymEquipment?.length ?? 0) > 0;
  if (facility === 'gym_park' || d.hasUsableEquipment || equipped) {
    return { activityType: 'strength', locationKind: 'gym', cooldownEligible: false };
  }
  if (d.stopRole) return d.stopRole;
  const nature = d.natureType, urban = d.urbanType;
  if (nature === 'observation_point') return { activityType: 'stretch', locationKind: 'viewpoint', cooldownEligible: true };
  if (nature === 'spring') return { activityType: 'stretch', locationKind: 'spring', cooldownEligible: true };
  if (facility === 'nature_community') return { activityType: 'stretch', locationKind: 'scenic', cooldownEligible: true };
  if (facility === 'zen_spot') return { activityType: 'stretch', locationKind: 'scenic', cooldownEligible: true };
  if (facility === 'urban_spot') {
    if (urban === 'stairs') return { activityType: 'strength', locationKind: 'stairs', cooldownEligible: false };
    return { activityType: 'core', locationKind: 'bench', cooldownEligible: false };
  }
  return null;
}

async function main() {
  const routeDoc = await db.collection('official_routes').doc(ROUTE_ID).get();
  if (!routeDoc.exists) { console.log('ROUTE NOT FOUND'); return; }
  const routeData = routeDoc.data() as any;
  const routePath = normalizePath(routeData.path);
  console.log(`Route: "${routeData.name}" — ${routePath.length} path points, ${routeData.distance}km\n`);

  const parksSnap = await db.collection('parks').where('city', '==', 'שדרות').get();
  console.log(`Sderot parks scanned: ${parksSnap.size}`);

  type Hit = { id: string; name: string; mapping: any; waypointIndex: number; distToPath: number; lat: number; lng: number };
  const hits: Hit[] = [];
  for (const doc of parksSnap.docs) {
    const d = doc.data() as any;
    const lat = d.location?.lat, lng = d.location?.lng;
    if (lat == null || lng == null) continue;
    const mapping = classifyStopRole(d);
    if (!mapping) continue;
    let dist = Infinity, wp = -1;
    for (let i = 0; i < routePath.length; i++) {
      const dv = haversineMeters(lat, lng, routePath[i][1], routePath[i][0]);
      if (dv < dist) { dist = dv; wp = i; }
    }
    if (dist <= MATCH_RADIUS_M) hits.push({ id: doc.id, name: d.name, mapping, waypointIndex: wp, distToPath: dist, lat, lng });
  }

  const preferenceRank = (h: Hit) => (h.mapping.activityType === 'strength' ? 2 : h.mapping.activityType === 'core' ? 1 : 0);
  const kept: Hit[] = [];
  for (const h of [...hits].sort((a, b) => (preferenceRank(b) - preferenceRank(a)) || (a.distToPath - b.distToPath))) {
    const tooClose = kept.some((k) => haversineMeters(h.lat, h.lng, k.lat, k.lng) < MIN_STOP_GAP_M);
    if (!tooClose) kept.push(h);
  }
  kept.sort((a, b) => (a.waypointIndex - b.waypointIndex) || (a.distToPath - b.distToPath));

  console.log(`\n── Resolved stops, in path order (${kept.length}) ──`);
  kept.forEach((h, i) => {
    console.log(`${i + 1}. "${h.name}" — ${h.mapping.activityType}/${h.mapping.locationKind} — ${h.distToPath.toFixed(0)}m from path, waypoint#${h.waypointIndex}/${routePath.length - 1}${h.mapping.cooldownEligible ? ' [cooldown-eligible]' : ''}`);
  });
  console.log(`\nLast stop is stretch/cooldown-eligible? ${kept.length > 0 && kept[kept.length - 1].mapping.cooldownEligible ? 'YES' : 'NO'}`);

  console.log(`\n── ALL candidates within ${MATCH_RADIUS_M}m (before dedup, for context) ──`);
  hits.sort((a, b) => a.waypointIndex - b.waypointIndex).forEach((h) => {
    console.log(`   "${h.name}" — ${h.mapping.activityType} — ${h.distToPath.toFixed(0)}m — wp#${h.waypointIndex}${kept.includes(h) ? ' [KEPT]' : ' [dropped: too close to another]'}`);
  });
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
