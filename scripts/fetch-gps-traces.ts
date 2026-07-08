/**
 * scripts/fetch-gps-traces.ts — READ ONLY
 *
 * Pulls raw GPS trace recordings (uploaded from GpsDebugHud) out of
 * users/{uid}/gps_traces and writes each as a local JSON file under
 * scripts/gps-traces/ for offline filter replay (B.3 fixtures).
 *
 * Usage: npx tsx scripts/fetch-gps-traces.ts [daysBack=7] [uid]
 *   With uid → queries users/{uid}/gps_traces directly (no collection-group
 *   index needed). Without → collectionGroup query (requires the
 *   COLLECTION_GROUP_DESC index on gps_traces.createdAt).
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  const daysBack = Number(process.argv[2] ?? 7);
  const uid = process.argv[3];
  const since = new Date(Date.now() - daysBack * 24 * 3600 * 1000);

  const base = uid
    ? db.collection('users').doc(uid).collection('gps_traces')
    : db.collectionGroup('gps_traces');
  const snap = await base
    .where('createdAt', '>=', since)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  console.log(`\n${snap.size} trace docs in the last ${daysBack}d\n`);

  const outDir = path.join(__dirname, 'gps-traces');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  for (const doc of snap.docs) {
    const d = doc.data();
    const created = d.createdAt?.toDate?.();
    const durationSec = Math.round(((d.endedAtMs ?? 0) - (d.startedAtMs ?? 0)) / 1000);
    const stamp = created ? created.toISOString().replace(/[:.]/g, '-').slice(0, 19) : doc.id;
    const fileName = `${stamp}_${d.activityType ?? 'unknown'}_${doc.id.slice(0, 6)}.json`;

    fs.writeFileSync(
      path.join(outDir, fileName),
      JSON.stringify(
        {
          traceId: doc.id,
          userId: d.userId,
          activityType: d.activityType,
          startedAtMs: d.startedAtMs,
          endedAtMs: d.endedAtMs,
          sampleCount: d.sampleCount,
          filteredDistanceKm: d.filteredDistanceKm,
          samples: JSON.parse(d.samplesJson ?? '[]'),
        },
        null,
        2,
      ),
    );

    console.log(
      `── ${fileName}\n   ${created?.toLocaleString('he-IL') ?? '?'} · ${d.activityType} · ` +
      `${durationSec}s · ${d.sampleCount} samples · live-filter ${((d.filteredDistanceKm ?? 0) * 1000).toFixed(0)}m`,
    );
  }

  console.log(`\nSaved to ${outDir}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
