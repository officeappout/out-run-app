/**
 * DIAGNOSTIC — Stage 2 field-test verification (19.09.2026), David's item 3.
 *
 * READ-ONLY. Counts only — no names, no user content. Answers: how many
 * walking routes exist for Sderot in official_routes/curated_routes, and
 * how many have missing geometry or missing required fields (per the
 * Route schema documented in docs/field-test/01-walking-flow-map.md §1).
 *
 * Run: npx tsx scripts/_verify-sderot-walking-route-counts.ts
 *
 * Uses the same direct firebase-admin init pattern as
 * scripts/audit-route-quality-signals.ts — src/lib/firebase-admin.ts carries
 * a Next.js `import 'server-only'` guard that throws under plain tsx.
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const REQUIRED_FIELDS = ['id', 'name', 'distance', 'duration', 'score', 'type', 'difficulty', 'rating', 'calories', 'features', 'segments', 'path'] as const;

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

async function main() {
  const db = initFb();

  // 1. Resolve Sderot's authority doc — never assume spelling; list candidates.
  const authoritiesSnap = await db.collection('authorities').get();
  const candidates = authoritiesSnap.docs.filter((d) => {
    const data = d.data() as Record<string, unknown>;
    const name = String(data.name ?? data.city ?? '');
    return name.includes('שדרות') || d.id.toLowerCase().includes('sderot') || String(data.city ?? '').toLowerCase().includes('sderot');
  });
  console.log(`Authority docs matching "שדרות"/"sderot": ${candidates.length}`);
  for (const c of candidates) {
    const data = c.data() as Record<string, unknown>;
    console.log(`  - id="${c.id}" city="${data.city ?? ''}" name="${data.name ?? ''}" status="${data.status ?? ''}"`);
  }

  if (candidates.length === 0) {
    console.log('No authority match found — cannot scope route counts. Stopping.');
    return;
  }

  const authorityIds = candidates.map((c) => c.id);
  const cityValues = new Set(candidates.map((c) => String((c.data() as Record<string, unknown>).city ?? '')).filter(Boolean));

  for (const collectionName of ['official_routes', 'curated_routes']) {
    console.log(`\n=== ${collectionName} ===`);
    const snap = await db.collection(collectionName).get();
    console.log(`Total docs in collection (network-wide): ${snap.size}`);

    const sderotDocs = snap.docs.filter((d) => {
      const data = d.data() as Record<string, unknown>;
      const authorityId = String(data.authorityId ?? '');
      const city = String(data.city ?? '');
      return authorityIds.includes(authorityId) || cityValues.has(city);
    });
    console.log(`Docs scoped to Sderot (by authorityId or city field): ${sderotDocs.length}`);

    let walkingCount = 0;
    let runningCount = 0;
    let otherTypeCount = 0;
    let missingGeometry = 0;
    let shortGeometry = 0; // path present but < 2 points
    const missingFieldCounts: Record<string, number> = {};
    for (const f of REQUIRED_FIELDS) missingFieldCounts[f] = 0;

    for (const d of sderotDocs) {
      const data = d.data() as Record<string, unknown>;
      const type = data.type ?? (Array.isArray(data.activityTypes) ? data.activityTypes[0] : undefined);
      const activityTypes = Array.isArray(data.activityTypes) ? (data.activityTypes as string[]) : [];
      const isWalking = type === 'walking' || activityTypes.includes('walking');
      const isRunning = type === 'running' || activityTypes.includes('running');
      if (isWalking) walkingCount++;
      else if (isRunning) runningCount++;
      else otherTypeCount++;

      const path = data.path;
      if (!Array.isArray(path) || path.length === 0) missingGeometry++;
      else if (path.length < 2) shortGeometry++;

      for (const f of REQUIRED_FIELDS) {
        const v = (data as Record<string, unknown>)[f];
        if (v === undefined || v === null) missingFieldCounts[f]++;
      }
    }

    console.log(`  type/activityTypes includes 'walking': ${walkingCount}`);
    console.log(`  type/activityTypes includes 'running' (no walking): ${runningCount}`);
    console.log(`  other/unclassified type: ${otherTypeCount}`);
    console.log(`  missing geometry (no path array, or empty): ${missingGeometry}`);
    console.log(`  path present but <2 points: ${shortGeometry}`);
    console.log('  missing required fields (count of docs missing each):');
    for (const f of REQUIRED_FIELDS) {
      if (missingFieldCounts[f] > 0) console.log(`    - ${f}: ${missingFieldCounts[f]}`);
    }
    if (Object.values(missingFieldCounts).every((n) => n === 0)) {
      console.log('    (none — all Sderot docs in this collection have every required field present)');
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
