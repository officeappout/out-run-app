/**
 * upload-pupil-athlete-content.ts — writes Stage 1's pupil + pro_athlete
 * content (Batch 1 + Batch 2 combined, STUDENT BUNDLES EXCLUDED) to the real
 * workoutMetadata title/description/logicCue collections.
 *
 * Same field-mapping as scripts/scenario-sweep.ts's loadAndApplyContentOverlay
 * (title->text, description->description, logicCue->text, skipped when
 * absent) so what was verified in-memory is byte-identical to what gets
 * written. Firestore auto-generates each doc's ID (matches the existing
 * production convention — bundleId lives as a data field, never as the doc
 * ID itself); doc IDs are printed after a successful write for the rollback
 * record.
 *
 * DEFAULT MODE IS DRY-RUN. Pass --write to actually commit to Firestore.
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/upload-pupil-athlete-content.ts            # dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/upload-pupil-athlete-content.ts --write    # real write
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initAdmin() {
  if (getApps().length) return;
  const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  initializeApp({
    credential: cert({
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
    }),
    projectId: parsed.project_id,
  });
}
initAdmin();
const db = getFirestore();

interface Bundle {
  bundleId: string; persona: string; gender?: string; timeOfDay?: string;
  location?: string; variant?: string; title: string; description: string; logicCue?: string;
}

const FIXTURE_FILES = [
  'scripts/fixtures/batch1-persona-content.json',
  'scripts/fixtures/batch2-persona-content.json',
];
const TARGET_PERSONAS = new Set(['pupil', 'pro_athlete']); // student explicitly excluded

async function main() {
  const isWrite = process.argv.includes('--write');

  const allBundles: Bundle[] = [];
  for (const f of FIXTURE_FILES) {
    const parsed = JSON.parse(readFileSync(f, 'utf-8')) as { bundles: Bundle[] };
    allBundles.push(...parsed.bundles);
  }
  const bundles = allBundles.filter(b => TARGET_PERSONAS.has(b.persona));
  const excludedStudent = allBundles.filter(b => b.persona === 'student');

  console.log(`[upload] ${allBundles.length} total bundles loaded from ${FIXTURE_FILES.length} files`);
  console.log(`[upload] ${bundles.length} bundles targeted (persona in {pupil, pro_athlete})`);
  console.log(`[upload] ${excludedStudent.length} student bundles EXCLUDED (not part of this write): ${excludedStudent.map(b => b.bundleId).join(', ')}`);
  console.log(`[upload] mode: ${isWrite ? 'REAL WRITE' : 'DRY RUN (pass --write to commit)'}`);
  console.log('');

  // Collision guard — never overwrite/duplicate an existing bundleId.
  const [titlesSnap, descSnap, cuesSnap] = await Promise.all([
    db.collection('workoutMetadata/workoutTitles/titles').get(),
    db.collection('workoutMetadata/smartDescriptions/descriptions').get(),
    db.collection('workoutMetadata/logicCues/cues').get(),
  ]);
  const existingBundleIds = new Set<string>();
  [titlesSnap, descSnap, cuesSnap].forEach(snap => snap.docs.forEach(d => {
    const bid = d.data().bundleId;
    if (bid) existingBundleIds.add(bid);
  }));
  const collisions = bundles.filter(b => existingBundleIds.has(b.bundleId));
  if (collisions.length > 0) {
    console.error(`[upload] ABORT — ${collisions.length} bundleId collision(s) with existing production content: ${collisions.map(b => b.bundleId).join(', ')}`);
    process.exit(1);
  }
  console.log(`[upload] collision check passed — 0/${bundles.length} bundleIds already exist in production\n`);

  const writtenDocs: Array<{ collection: string; docId: string; bundleId: string }> = [];

  for (const b of bundles) {
    const titleRow = { text: b.title, persona: b.persona, gender: b.gender, timeOfDay: b.timeOfDay, location: b.location, bundleId: b.bundleId };
    const descRow = { description: b.description, persona: b.persona, gender: b.gender, timeOfDay: b.timeOfDay, location: b.location, bundleId: b.bundleId };
    const cueRow = b.logicCue
      ? { text: b.logicCue, persona: b.persona, gender: b.gender, timeOfDay: b.timeOfDay, location: b.location, variant: b.variant, bundleId: b.bundleId }
      : null;

    console.log(`bundleId=${b.bundleId} (${b.persona})`);
    console.log(`  title:       "${b.title}"`);
    console.log(`  description: "${b.description}"`);
    console.log(`  logicCue:    ${b.logicCue ? `"${b.logicCue}"` : '(none — rides the dynamic fallback)'}`);

    if (isWrite) {
      const titleRef = await db.collection('workoutMetadata/workoutTitles/titles').add(titleRow);
      const descRef = await db.collection('workoutMetadata/smartDescriptions/descriptions').add(descRow);
      writtenDocs.push({ collection: 'workoutTitles/titles', docId: titleRef.id, bundleId: b.bundleId });
      writtenDocs.push({ collection: 'smartDescriptions/descriptions', docId: descRef.id, bundleId: b.bundleId });
      console.log(`  -> WROTE title doc ${titleRef.id}, description doc ${descRef.id}`);
      if (cueRow) {
        const cueRef = await db.collection('workoutMetadata/logicCues/cues').add(cueRow);
        writtenDocs.push({ collection: 'logicCues/cues', docId: cueRef.id, bundleId: b.bundleId });
        console.log(`  -> WROTE logicCue doc ${cueRef.id}`);
      }
    }
    console.log('');
  }

  console.log(`[upload] ${isWrite ? 'DONE — wrote' : 'DRY RUN — would write'} ${bundles.length} bundles ` +
    `(${bundles.length} titles, ${bundles.length} descriptions, ${bundles.filter(b => b.logicCue).length} logicCues)`);

  if (isWrite) {
    console.log('\n[upload] Full written-doc manifest (for rollback):');
    for (const d of writtenDocs) console.log(`  ${d.collection}/${d.docId}  (bundleId=${d.bundleId})`);
  }

  process.exit(0);
}

main().catch(e => { console.error('[upload] CRASHED:', e?.stack || e); process.exit(1); });
