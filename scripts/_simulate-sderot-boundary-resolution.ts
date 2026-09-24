/**
 * READ-ONLY simulation — fetches Sderot's real OSM boundary polygon via the
 * existing boundary-geometry endpoint (does not persist anything; that
 * endpoint only fetches+returns geometry), then tests how many of the 31
 * authorityId-less parks fall inside it. Writes nothing to Firestore.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

// Mirrors src/lib/route-collections/authority-resolution.ts's isPointInPolygon,
// extended to also handle MultiPolygon (OR across each constituent polygon).
function isPointInRing(point: { lat: number; lng: number }, ring: number[][]): boolean {
  let inside = false;
  const x = point.lng, y = point.lat;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPointInGeometry(point: { lat: number; lng: number }, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  if (geometry.type === 'Polygon') {
    return isPointInRing(point, geometry.coordinates[0]);
  }
  return geometry.coordinates.some((poly) => isPointInRing(point, poly[0]));
}

async function main() {
  const agentKey = process.env.AGENT_API_KEY;
  if (!agentKey) { console.error('AGENT_API_KEY missing'); process.exit(1); }

  console.log('Fetching Sderot boundary geometry live (relationId=1380001)...');
  const res = await fetch('https://outrun.co.il/api/admin/city-mapping/boundary-geometry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Key': agentKey },
    body: JSON.stringify({ relationId: 1380001 }),
  });
  console.log('status:', res.status);
  const json = await res.json();
  if (!res.ok) { console.error('failed:', json); process.exit(1); }
  const geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon = json.geojson.geometry;
  console.log('geometry type:', geometry.type);

  const parksSnap = await db.collection('parks').select('location', 'authorityId', 'name').get();
  const missingAuthority = parksSnap.docs.filter((d) => !d.data().authorityId);
  console.log(`\n${missingAuthority.length} parks currently missing authorityId. Testing against Sderot's polygon...`);

  let matchCount = 0;
  for (const doc of missingAuthority) {
    const loc = doc.data().location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
    if (isPointInGeometry({ lat: loc.lat, lng: loc.lng }, geometry)) {
      matchCount++;
      console.log(`  MATCH: ${doc.id} ("${doc.data().name}")`);
    }
  }
  console.log(`\n${matchCount} of ${missingAuthority.length} authority-less parks fall inside Sderot's boundary.`);
}

main().catch((err) => { console.error('failed:', err); process.exit(1); });
