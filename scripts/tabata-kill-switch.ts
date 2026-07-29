/**
 * scripts/tabata-kill-switch.ts — EMERGENCY OFF/ON for the tabata finisher.
 *
 * No deploy required. Flips the Firestore data the engine reads, so it takes
 * effect for every user within ~30s (the programLevelSettings in-memory cache
 * TTL, PLS_CACHE_TTL_MS in programLevelSettings.service.ts).
 *
 *   STATUS (default):  npx tsx --env-file=.env.local scripts/tabata-kill-switch.ts
 *   KILL:              npx tsx --env-file=.env.local scripts/tabata-kill-switch.ts --off
 *   RESTORE:           npx tsx --env-file=.env.local scripts/tabata-kill-switch.ts --on
 *
 * ⚠️  WHY IT SETS 0 AND NEVER DELETES THE FIELD
 * The resolver is `c.tabataProbability ?? DEFAULT_TABATA_PROBABILITY`
 * (tabata-finisher.utils.ts). `??` falls back only on null/undefined — so:
 *     0          → 0     → `tabataP > 0` is false → finisher never fires  ✅
 *     <deleted>  → 0.15  → finisher STILL FIRES at 15%                    ❌
 * Deleting the field is NOT a kill — it silently re-arms the default. This
 * script therefore always writes an explicit 0.
 *
 * Scope: every programLevelSettings doc with 'tabata' in preferredProtocols (85
 * as of 29.07). `preferredProtocols` is never touched, so --on is a clean
 * restore of the band table and the docs stay otherwise byte-identical.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

/** Band table — MUST stay in sync with rollout-tabata-finisher.ts. */
function tabataProbFor(level: number): number {
  if (level <= 6) return 0.12;
  if (level <= 10) return 0.15;
  if (level <= 14) return 0.18;
  if (level <= 18) return 0.20;
  return 0.22; // 19+
}

async function main() {
  const off = process.argv.includes('--off');
  const on = process.argv.includes('--on');
  if (off && on) { console.error('❌ pass --off or --on, not both'); process.exit(1); }
  const mode = off ? '🔴 KILL' : on ? '🟢 RESTORE' : 'STATUS (read-only)';
  console.log(`\n🎛️  Tabata finisher kill-switch — project=${key.project_id} — ${mode}\n`);

  const snap = await db.collection('programLevelSettings').get();
  const docs = snap.docs.filter((d) => ((d.data() as any).preferredProtocols ?? []).includes('tabata'));

  const rows = docs.map((d) => {
    const level = Number(d.id.match(/_level_(\d+)$/)?.[1] ?? NaN);
    return { docId: d.id, level, current: (d.data() as any).tabataProbability, target: off ? 0 : tabataProbFor(level) };
  });

  const live = rows.filter((r) => (r.current ?? 0) > 0).length;
  console.log(`${rows.length} doc(s) enable tabata — ${live} currently ARMED (p>0), ${rows.length - live} at 0 (off).`);

  if (!off && !on) {
    const byProb = new Map<number, number>();
    for (const r of rows) byProb.set(r.current, (byProb.get(r.current) ?? 0) + 1);
    for (const [p, n] of Array.from(byProb.entries()).sort((a, b) => a[0] - b[0])) {
      console.log(`   tabataProbability=${p} → ${n} doc(s)`);
    }
    console.log(`\nFinisher is ${live > 0 ? 'ARMED' : '🔴 OFF'}. Re-run with --off to kill, --on to restore.\n`);
    return;
  }

  if (rows.some((r) => Number.isNaN(r.level))) {
    console.error('❌ a docId did not match <programId>_level_<n> — aborting rather than guessing.'); process.exit(1);
  }

  console.log(`⚠️  WRITING ${rows.length} doc(s) → tabataProbability ${off ? '0 (explicit, never deleted)' : 'band value'}…`);
  for (const r of rows) {
    await db.collection('programLevelSettings').doc(r.docId).set(
      { tabataProbability: r.target, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  console.log(
    `✅ ${rows.length} doc(s) updated. Finisher is now ${off ? '🔴 OFF' : '🟢 ARMED (0.12-0.22 by level)'}.` +
    ` Takes effect for all users within ~30s (PLS cache TTL).\n`,
  );
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
