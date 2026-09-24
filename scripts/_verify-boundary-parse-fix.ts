/**
 * READ-ONLY live verification of the parseBoundaryGeoJSON fix in
 * fetchAuthorityBoundaries() (contribution.service.ts). Imports the REAL
 * parseBoundaryGeoJSON + resolveAuthorityForPoint from
 * src/lib/route-collections/authority-resolution.ts (pure TS, safe under
 * tsx) and replays the exact same fetch+parse this app's client code does,
 * against the real production `authorities` collection (6 authorities now
 * have real boundaryGeoJSON as of the authority-boundary pipeline commit).
 */
import * as admin from 'firebase-admin';
import { parseBoundaryGeoJSON, resolveAuthorityForPoint, type AuthorityBoundary } from '../src/lib/route-collections/authority-resolution';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function fetchAuthorityBoundaries(): Promise<AuthorityBoundary[]> {
  const snap = await db.collection('authorities').where('type', 'in', ['city', 'regional_council']).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name ?? '',
      boundaryGeoJSON: parseBoundaryGeoJSON(data.boundaryGeoJSON) ?? undefined,
      coordinates: data.coordinates ?? undefined,
      radiusKm: data.radiusKm ?? undefined,
    };
  });
}

async function main() {
  const authorities = await fetchAuthorityBoundaries();
  console.log('total city/regional_council authorities fetched:', authorities.length);

  const withRealBoundary = authorities.filter((a) => a.boundaryGeoJSON);
  console.log('with a successfully-parsed boundaryGeoJSON (object, not string):', withRealBoundary.length);
  console.log('names:', withRealBoundary.map((a) => a.name));

  // Sderot pilot park's real coordinates (2t5az38z4tbMFJOSVBpp)
  const inSderot = { lat: 31.534122289409535, lng: 34.59679605723471 };
  const resultIn = resolveAuthorityForPoint(inSderot, authorities);
  console.log('\nresolveAuthorityForPoint(Sderot pilot park coords):', resultIn);

  // A point clearly in Tel Aviv — must NOT resolve as Sderot
  const inTelAviv = { lat: 32.0853, lng: 34.7818 };
  const resultOut = resolveAuthorityForPoint(inTelAviv, authorities);
  console.log('resolveAuthorityForPoint(Tel Aviv center):', resultOut);
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
