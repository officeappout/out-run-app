/**
 * scripts/route-quality/dump-segment-corpus.ts — READ-ONLY.
 *
 * Dumps the street_segments documents within RADIUS_KM of each measurement
 * start (scripts/route-quality/starts.ts) into a local JSON corpus that the
 * hermetic measurement runner replays (so the before/after comparison runs
 * the real generator without touching production Firestore from the client
 * SDK). Uses the Admin SDK for reads only — no write call exists here.
 *
 *   npx tsx --env-file=.env.local scripts/route-quality/dump-segment-corpus.ts <outDir>
 */
import * as admin from 'firebase-admin';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { geohashQueryBounds } from 'geofire-common';
import { MEASURE_STARTS } from './starts';

const RADIUS_KM = 2.7;
const outDir = process.argv[2];
if (!outDir) { console.error('usage: dump-segment-corpus.ts <outDir>'); process.exit(1); }

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) { console.error('FIREBASE_SERVICE_ACCOUNT_KEY not set'); process.exit(1); }
const cred = JSON.parse(rawKey);
admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
const db = admin.firestore();

async function main() {
  mkdirSync(outDir, { recursive: true });
  const all = new Map<string, Record<string, unknown>>();
  for (const s of MEASURE_STARTS) {
    const bounds = geohashQueryBounds([s.lat, s.lng], RADIUS_KM * 1000);
    let n = 0;
    const cities = new Map<string, number>();
    for (const [a, b] of bounds) {
      const snap = await db.collection('street_segments').orderBy('geohash').startAt(a).endAt(b).get();
      for (const d of snap.docs) {
        n++;
        const data = d.data();
        cities.set(String(data.cityName), (cities.get(String(data.cityName)) ?? 0) + 1);
        all.set(d.id, { id: d.id, ...data });
      }
    }
    console.log(`${s.id}: ${n} docs in ${bounds.length} boxes; cityName counts: ${JSON.stringify(Object.fromEntries(cities))}`);
  }
  const rows = Array.from(all.values()).map(r => JSON.parse(JSON.stringify(r, (_k, v) =>
    v && typeof v === 'object' && typeof v.toDate === 'function' ? v.toDate().toISOString() : v)));
  writeFileSync(join(outDir, 'street_segments.json'), JSON.stringify(rows));
  console.log(`wrote ${rows.length} unique docs → ${join(outDir, 'street_segments.json')}`);
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
