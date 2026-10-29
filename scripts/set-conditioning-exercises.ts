/**
 * Completes the 4 burpee docs as conditioning moves (owner 29.10.2026,
 * training-audit PR 7): movementGroup 'conditioning' + conditioningLevel, reps, main,
 * home only (their park methods have no video). Before this they had no type / group /
 * level, so no generation path could pick them.
 *
 * DRY-RUN BY DEFAULT: prints each doc's current vs new values and writes NOTHING.
 * --apply (after the owner's separate approval) updates only the fields below, one batch.
 *
 * Run (dry-run):            npx tsx --env-file=.env.local scripts/set-conditioning-exercises.ts
 * Run (WRITE, approved):    npx tsx --env-file=.env.local scripts/set-conditioning-exercises.ts --apply
 */
import * as admin from 'firebase-admin';

const COMMON = {
  movementGroup: 'conditioning',
  type: 'reps',
  loggingMode: 'reps',
  exerciseRole: 'main',
  isFollowAlong: false,
  symmetry: 'bilateral',
  requiredLocations: ['home'],
};
/** id → difficulty on the legs-level scale + seconds per rep. */
const PLAN: Record<string, { label: string; conditioningLevel: number; secondsPerRep: number }> = {
  nunGVGOEmOMnxiwh7jcu: { label: 'beginner burpee', conditioningLevel: 3, secondsPerRep: 3 },
  '3dIrpJQHp5QbimPVTZDk': { label: 'half burpee', conditioningLevel: 4, secondsPerRep: 3 },
  '4kww5BB13UkNaaAjZKS0': { label: 'burpee', conditioningLevel: 6, secondsPerRep: 3 },
  f4ZbXHOaV5lRTC9JQPkk: { label: 'burpee with push-up', conditioningLevel: 8, secondsPerRep: 4 },
};

const APPLY = process.argv.includes('--apply');

async function main() {
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
  if (!key?.project_id) { console.error('FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key) });
  const db = admin.firestore();
  const batch = db.batch();
  let changes = 0;

  for (const [id, p] of Object.entries(PLAN)) {
    const ref = db.collection('exercises').doc(id);
    const snap = await ref.get();
    if (!snap.exists) { console.error(`✗ ${id} (${p.label}) not found — aborting`); process.exit(1); }
    const cur = snap.data() ?? {};
    const next: Record<string, unknown> = { ...COMMON, conditioningLevel: p.conditioningLevel, secondsPerRep: p.secondsPerRep };
    const diff = Object.entries(next).filter(([k, v]) => JSON.stringify(cur[k]) !== JSON.stringify(v));
    const name = cur.name?.he ?? '?';
    const homeVideo = (cur.execution_methods ?? []).some((m: any) => m.location === 'home' && (m.media?.mainVideoUrl || m.media?.previewVideo));
    console.log(`\n${id}  ${name}  (${p.label})  home video: ${homeVideo ? 'yes' : 'NO'}`);
    if (diff.length === 0) { console.log('  already up to date'); continue; }
    for (const [k, v] of diff) console.log(`  ${k}: ${JSON.stringify(cur[k] ?? null)} → ${JSON.stringify(v)}`);
    batch.update(ref, { ...Object.fromEntries(diff), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    changes++;
  }

  console.log(`\n${changes} doc(s) to update.`);
  if (!APPLY) { console.log('DRY-RUN — nothing written. Re-run with --apply after approval.'); return; }
  if (changes) await batch.commit();
  console.log(`✓ wrote ${changes} doc(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
