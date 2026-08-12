/**
 * scripts/seed-tabata-rollout.ts
 *
 * Rollout: enable Tabata as an OCCASIONAL variety protocol, additively.
 *
 * WHY additive-only: the generator's protocol scan (home-workout.service.ts)
 * takes the FIRST enrolled program (scheduled today, else highest user level)
 * that has `preferredProtocols`, and picks UNIFORMLY from that array at the
 * level's `protocolProbability`. So Tabata must be added to the SAME docs that
 * already drive the rotation — otherwise whether a user meets Tabata depends on
 * which program happens to win the scan that day.
 *
 * WHAT this does — for every `programLevelSettings/{progId}_level_{N}` doc where:
 *     N >= MIN_LEVEL                          (skip beginners; not level 1)
 *     preferredProtocols is a non-empty array (protocols already fire here)
 *     'tabata' is not already present         (idempotent)
 *   → add 'tabata' to preferredProtocols (FieldValue.arrayUnion).
 *
 * WHAT it does NOT do: never changes protocolProbability, never creates new
 * docs, never touches levels < MIN_LEVEL or docs with no protocols. Purely
 * additive → Tabata joins the existing pool and fires ~ probability / poolSize
 * of the time (e.g. pool of 3 at p=0.2 → ~6.7% of workouts = occasional).
 *
 * Usage:
 *   DRY RUN (default — no writes, prints the full proposed change table):
 *     npx tsx --env-file=.env.local scripts/seed-tabata-rollout.ts
 *   WRITE to Firestore (only after David approves the dry-run):
 *     npx tsx --env-file=.env.local scripts/seed-tabata-rollout.ts --write
 *
 * Safe to re-run — idempotent (skips docs that already include 'tabata').
 */
import * as admin from 'firebase-admin';

const isDryRun = !process.argv.includes('--write');

// Skip beginner levels. The generator forces straight sets on Bolt-1 anyway,
// and the per-level protocolProbability default is 0 for level <= 5.
const MIN_LEVEL = 6;

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key || !key.project_id) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing/invalid — run with --env-file=.env.local');
  process.exit(1);
}
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

const LEVEL_RE = /_level_(\d+)$/;

interface Change {
  docId: string;
  name: string;
  level: number;
  before: string[];
  after: string[];
  probability: number | undefined;
  approxFreqPct: number | null; // probability / poolSize, as %
}

async function main() {
  console.log(`\n🎯 Tabata rollout — project=${key.project_id} — mode=${isDryRun ? 'DRY RUN' : '⚠️  WRITE'} — MIN_LEVEL=${MIN_LEVEL}\n`);

  // Resolve program id → human name (docId is `{programId}_level_{N}`).
  const progSnap = await db.collection('programs').get();
  const nameOf = new Map<string, string>();
  for (const p of progSnap.docs) {
    const pd = p.data();
    nameOf.set(p.id, pd.name ?? pd.slug ?? pd.movementPattern ?? p.id);
  }
  const progName = (docId: string) => {
    const pid = docId.replace(LEVEL_RE, '');
    return nameOf.get(pid) ?? pid;
  };

  const snap = await db.collection('programLevelSettings').get();
  console.log(`Scanned ${snap.size} programLevelSettings docs across ${progSnap.size} programs.\n`);

  const changes: Change[] = [];
  const alreadyOn: Array<{ docId: string; level: number; prefs: string[]; p: number | undefined }> = [];
  let skippedNoLevel = 0, skippedLowLevel = 0, skippedNoProtocols = 0, skippedAlready = 0;

  for (const d of snap.docs) {
    const m = d.id.match(LEVEL_RE);
    if (!m) { skippedNoLevel++; continue; }
    const level = parseInt(m[1], 10);
    const data = d.data();
    const prefsAll: string[] = Array.isArray(data.preferredProtocols) ? data.preferredProtocols : [];
    if (prefsAll.includes('tabata')) {
      skippedAlready++;
      alreadyOn.push({ docId: d.id, level, prefs: prefsAll, p: typeof data.protocolProbability === 'number' ? data.protocolProbability : undefined });
      continue;
    }
    if (level < MIN_LEVEL) { skippedLowLevel++; continue; }

    const prefs = prefsAll;
    if (prefs.length === 0) { skippedNoProtocols++; continue; }

    const after = [...prefs, 'tabata'];
    const probability = typeof data.protocolProbability === 'number' ? data.protocolProbability : undefined;
    changes.push({
      docId: d.id,
      name: progName(d.id),
      level,
      before: prefs,
      after,
      probability,
      approxFreqPct: probability != null ? Math.round((probability / after.length) * 1000) / 10 : null,
    });
  }

  changes.sort((a, b) => a.name.localeCompare(b.name) || a.level - b.level);

  if (alreadyOn.length) {
    console.log(`Already ON (Tabata live today, ${alreadyOn.length}):`);
    for (const a of alreadyOn.sort((x, y) => progName(x.docId).localeCompare(progName(y.docId)))) {
      console.log(`  ✅ ${progName(a.docId)} L${a.level}  [${a.prefs.join(', ')}]  p=${a.p ?? '—'}  (${a.docId})`);
    }
    console.log('');
  }

  console.log('Proposed additions (program | level | before → after | p | ~tabata freq):');
  console.log('─'.repeat(100));
  for (const c of changes) {
    console.log(
      `  ${(c.name + ` L${c.level}`).padEnd(28)} | ` +
      `[${c.before.join(', ')}] → [${c.after.join(', ')}] | ` +
      `p=${c.probability ?? '—'} | ~${c.approxFreqPct ?? '?'}%   (${c.docId})`,
    );
  }
  console.log('─'.repeat(100));
  console.log(
    `\nSummary: ${changes.length} doc(s) would gain 'tabata'. ` +
    `Skipped — no-level:${skippedNoLevel}, <L${MIN_LEVEL}:${skippedLowLevel}, ` +
    `no-protocols:${skippedNoProtocols}, already-tabata:${skippedAlready}.\n`,
  );

  if (isDryRun) {
    console.log('DRY RUN — no writes. Re-run with --write to apply (after approval).\n');
    return;
  }

  console.log('⚠️  WRITING…');
  let written = 0;
  for (const c of changes) {
    await db.collection('programLevelSettings').doc(c.docId).update({
      preferredProtocols: admin.firestore.FieldValue.arrayUnion('tabata'),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    written++;
  }
  console.log(`✅ Updated ${written} doc(s).\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
