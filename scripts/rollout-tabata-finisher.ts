/**
 * scripts/rollout-tabata-finisher.ts
 *
 * Rollout for the DECOUPLED tabata finisher (union track). On the lead programs
 * push / pull / legs / core / full_body, for every level L4+, APPEND 'tabata' to
 * preferredProtocols and write the dedicated `tabataProbability` per band:
 *     L4-6 = 0.12 · L7-10 = 0.15 · L11-14 = 0.18 · L15-18 = 0.20 · L19-22 = 0.22
 * Temporary smoke override: pull@L22 → 0.9 (David tests; lower it after).
 *
 * APPEND, NOT OVERWRITE: preferredProtocols uses FieldValue.arrayUnion('tabata')
 * and the write is `set(..., { merge: true })` — existing protocols and all other
 * doc fields are preserved; missing docs are created with only these two fields.
 *
 * Usage:
 *   DRY RUN (default — reads, writes nothing, prints the full change table + count):
 *     npx tsx --env-file=.env.local scripts/rollout-tabata-finisher.ts
 *   WRITE (only after David approves the dry-run):
 *     npx tsx --env-file=.env.local scripts/rollout-tabata-finisher.ts --write
 *
 * Idempotent — arrayUnion('tabata') is a no-op if already present; tabataProbability
 * is re-set to the table value each run (except the pull@L22 smoke override).
 */
import * as admin from 'firebase-admin';

const isDryRun = !process.argv.includes('--write');
const MIN_LEVEL = 4;
const TARGET_SLUGS = new Set(['push', 'pull', 'legs', 'core', 'full_body']);
const SMOKE_OVERRIDE: Record<string, number> = { 'pull_level_22': 0.9 }; // temp — lower after smoke

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

function tabataProbFor(level: number): number {
  if (level <= 6) return 0.12;
  if (level <= 10) return 0.15;
  if (level <= 14) return 0.18;
  if (level <= 18) return 0.20;
  return 0.22; // 19+
}

const slugOf = (p: any): string =>
  p.slug ?? p.movementPattern ?? (p.name ?? '').toLowerCase().replace(/[\s-]+/g, '_');

interface Row {
  docId: string; program: string; slug: string; level: number;
  exists: boolean; before: string[]; alreadyTabata: boolean;
  tabataProbability: number; smoke: boolean;
}

async function main() {
  console.log(`\n🎯 Tabata finisher rollout — project=${key.project_id} — mode=${isDryRun ? 'DRY RUN' : '⚠️  WRITE'} — L${MIN_LEVEL}+\n`);

  const progSnap = await db.collection('programs').get();
  const targets = progSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((p) => TARGET_SLUGS.has(slugOf(p)));

  const foundSlugs = new Set(targets.map((p) => slugOf(p)));
  const missingSlugs = [...TARGET_SLUGS].filter((s) => !foundSlugs.has(s));
  console.log(`Target programs found (${targets.length}): ${targets.map((p) => `${p.name ?? p.id}[${slugOf(p)}]`).join(', ')}`);
  if (missingSlugs.length) console.log(`⚠️  target slugs NOT found as programs: [${missingSlugs.join(', ')}] — skipped\n`);

  const rows: Row[] = [];
  for (const p of targets) {
    const maxLevels = typeof p.maxLevels === 'number' ? p.maxLevels : 22;
    for (let level = MIN_LEVEL; level <= maxLevels; level++) {
      const docId = `${p.id}_level_${level}`;
      const snap = await db.collection('programLevelSettings').doc(docId).get();
      const data = snap.data() as any;
      const before: string[] = Array.isArray(data?.preferredProtocols) ? data.preferredProtocols : [];
      const smokeKey = `${slugOf(p)}_level_${level}`;
      const prob = SMOKE_OVERRIDE[smokeKey] ?? tabataProbFor(level);
      rows.push({
        docId, program: p.name ?? p.id, slug: slugOf(p), level,
        exists: snap.exists, before, alreadyTabata: before.includes('tabata'),
        tabataProbability: prob, smoke: smokeKey in SMOKE_OVERRIDE,
      });
    }
  }

  console.log(`\nProposed writes (${rows.length}) — APPEND 'tabata' (arrayUnion) + set tabataProbability, merge:true:`);
  console.log('─'.repeat(104));
  for (const r of rows) {
    const after = r.alreadyTabata ? r.before : [...r.before, 'tabata'];
    console.log(
      `  ${(r.slug + ' L' + r.level).padEnd(14)} ${r.exists ? 'exists' : ' NEW  '} | ` +
      `[${r.before.join(', ')}] → [${after.join(', ')}] | tabataP=${r.tabataProbability}` +
      `${r.smoke ? '  🔬SMOKE-TEMP' : ''}${r.alreadyTabata ? '  (tabata already present)' : ''}`,
    );
  }
  console.log('─'.repeat(104));
  const news = rows.filter((r) => !r.exists).length;
  console.log(
    `\nSummary: ${rows.length} docs — ${rows.length - news} existing (append+merge, no overwrite), ${news} NEW (created with tabata+prob only). ` +
    `Smoke temp: ${rows.filter((r) => r.smoke).map((r) => `${r.slug}@L${r.level}=${r.tabataProbability}`).join(', ') || 'none'}.`,
  );
  console.log(`Append-not-overwrite: preferredProtocols via arrayUnion('tabata'); write via set(merge:true) — existing protocols + fields preserved.\n`);

  if (isDryRun) {
    console.log('DRY RUN — no writes. Re-run with --write after approval.\n');
    return;
  }

  console.log('⚠️  WRITING…');
  let n = 0;
  for (const r of rows) {
    await db.collection('programLevelSettings').doc(r.docId).set(
      {
        preferredProtocols: admin.firestore.FieldValue.arrayUnion('tabata'),
        tabataProbability: r.tabataProbability,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    n++;
  }
  console.log(`✅ Wrote ${n} docs (append + tabataProbability).\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
