/**
 * READ-ONLY live verification of the denylist redesign in
 * fetchAuthorityBoundaries() (contribution.service.ts). Imports the REAL
 * parseBoundaryGeoJSON + resolveAuthorityForPoint from
 * src/lib/route-collections/authority-resolution.ts and replays the exact
 * same fetch+filter+parse this app's client code does now, against the
 * real production `authorities` collection.
 */
import * as admin from 'firebase-admin';
import { parseBoundaryGeoJSON, resolveAuthorityForPoint, type AuthorityBoundary } from '../src/lib/route-collections/authority-resolution';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const EXCLUDED_AUTHORITY_TYPES = new Set(['neighborhood', 'settlement', 'military_unit', 'school']);
const KNOWN_TOP_AUTHORITY_TYPES = new Set(['city', 'regional_council', 'local_council']);

async function fetchAuthorityBoundaries(): Promise<AuthorityBoundary[]> {
  const snap = await db.collection('authorities').get();
  const result: AuthorityBoundary[] = [];
  const unrecognized = new Map<string, number>();
  const byType = new Map<string, number>();

  for (const d of snap.docs) {
    const data = d.data();
    const type = data.type ?? '(no type)';
    byType.set(type, (byType.get(type) ?? 0) + 1);
    if (EXCLUDED_AUTHORITY_TYPES.has(type)) continue;
    if (!KNOWN_TOP_AUTHORITY_TYPES.has(type)) unrecognized.set(type, (unrecognized.get(type) ?? 0) + 1);
    result.push({
      id: d.id,
      name: data.name ?? '',
      boundaryGeoJSON: parseBoundaryGeoJSON(data.boundaryGeoJSON) ?? undefined,
      coordinates: data.coordinates ?? undefined,
      radiusKm: data.radiusKm ?? undefined,
    });
  }

  console.log('=== Count only, by type (full collection) ===');
  console.log(Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])));
  console.log(`\nCandidates passed to resolveAuthorityForPoint: ${result.length} (excluded: ${snap.size - result.length} sub-city leaves)`);
  if (unrecognized.size > 0) {
    console.log('Unrecognized types included as candidates (would warn in real code):', Object.fromEntries(unrecognized));
  }

  return result;
}

async function main() {
  const authorities = await fetchAuthorityBoundaries();

  const withRealBoundary = authorities.filter((a) => a.boundaryGeoJSON);
  console.log(`\nAuthorities with a successfully-parsed boundary: ${withRealBoundary.length}`);
  console.log('names:', withRealBoundary.map((a) => a.name));

  // Zichron Yaakov's own authority doc coordinates (center point) — verified
  // to exist as bnhDavVEy3pq0vaQbEox, type local_council.
  const zichronDoc = await db.collection('authorities').doc('bnhDavVEy3pq0vaQbEox').get();
  const zichronCenter = zichronDoc.data()?.coordinates;
  console.log('\n=== Zichron Yaakov (local_council) ===');
  const resultZichron = resolveAuthorityForPoint(zichronCenter, authorities);
  console.log('resolveAuthorityForPoint(Zichron center):', resultZichron);

  // Sderot pilot park's real coordinates — must still resolve correctly.
  const inSderot = { lat: 31.534122289409535, lng: 34.59679605723471 };
  console.log('\n=== Sderot (city) — regression check ===');
  const resultSderot = resolveAuthorityForPoint(inSderot, authorities);
  console.log('resolveAuthorityForPoint(Sderot pilot park coords):', resultSderot);
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
