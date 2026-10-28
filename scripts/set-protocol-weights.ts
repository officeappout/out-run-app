/**
 * Sets `protocolWeights` on programLevelSettings docs from the owner's level table
 * (27.10.2026; src/features/workout-engine/logic/protocol-weights.ts).
 *
 * DRY-RUN BY DEFAULT: prints what each doc would get and writes NOTHING. Writing needs
 * the explicit --apply flag (and only touches the `protocolWeights` field, merge, one
 * batch). Docs that already have `protocolWeights` are left alone.
 *
 * Run (dry-run, reads Firestore):  npx tsx --env-file=.env.local scripts/set-protocol-weights.ts
 * Run (dry-run, offline):          npx tsx scripts/set-protocol-weights.ts --from-file path/to/programLevelSettings.json
 * Run (WRITE, after approval):     npx tsx --env-file=.env.local scripts/set-protocol-weights.ts --apply
 */
import * as fs from 'fs';
import { defaultProtocolWeightsForLevel } from '../src/features/workout-engine/logic/protocol-weights';

interface Row { id: string; program?: string; levelNumber?: number; protocolWeights?: Record<string, number> }

/** Skill-progression programs: no weights (a skill hold never belongs in an EMOM / pair). */
const SKIP_PROGRAMS = new Set(['front_lever', 'handstand', 'handstand_pushup', 'human_flag', 'muscle_up', 'one_arm_pullup', 'planche']);
/** Programs the table is meant to cover; reported per program so gaps (e.g. legs only to L12) are visible. */
const COVERED = ['push', 'pull', 'legs', 'core', 'full_body', 'upper_body'];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const fileIdx = args.indexOf('--from-file');
const fromFile = fileIdx >= 0 ? args[fileIdx + 1] : undefined;

async function loadRows(): Promise<{ rows: Row[]; db?: import('firebase-admin').firestore.Firestore }> {
  if (fromFile) return { rows: JSON.parse(fs.readFileSync(fromFile, 'utf8')) as Row[] };
  const admin = await import('firebase-admin');
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
  if (!key?.project_id) { console.error('FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key) });
  const db = admin.firestore();
  const snap = await db.collection('programLevelSettings').get();
  return { rows: snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Row), db };
}

async function main() {
  if (APPLY && fromFile) { console.error('--apply cannot be combined with --from-file'); process.exit(1); }
  const { rows, db } = await loadRows();
  const plan: Array<{ id: string; label: string; weights: Record<string, number> }> = [];
  let skippedHas = 0, skippedNoLevel = 0, skippedSkill = 0, empty = 0;
  for (const r of rows) {
    if (r.program && SKIP_PROGRAMS.has(r.program)) { skippedSkill++; continue; }
    if (r.protocolWeights) { skippedHas++; continue; }
    if (typeof r.levelNumber !== 'number') { skippedNoLevel++; continue; }
    const weights = defaultProtocolWeightsForLevel(r.levelNumber) as Record<string, number>;
    if (Object.keys(weights).length === 0) { empty++; continue; }
    plan.push({ id: r.id, label: `${r.program ?? '?'} L${r.levelNumber}`, weights });
  }
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} · ${rows.length} docs · to set: ${plan.length} · levels 1-5 (nothing to set): ${empty} · already have weights: ${skippedHas} · no level: ${skippedNoLevel} · skill programs skipped: ${skippedSkill}`);
  for (const prog of COVERED) {
    const lv = rows.filter((r) => r.program === prog && typeof r.levelNumber === 'number').map((r) => r.levelNumber as number).sort((a, b) => a - b);
    console.log(`  coverage ${prog.padEnd(11)} ${lv.length ? `L${lv[0]}-L${lv[lv.length - 1]} (${lv.length} docs)` : 'none'}`);
  }
  for (const p of plan) console.log(`  ${p.label.padEnd(24)} ${p.id}  ${JSON.stringify(p.weights)}`);
  if (!APPLY) { console.log('\nNothing written. Re-run with --apply (after approval) to write.'); return; }
  if (!db) throw new Error('no db');
  const admin = await import('firebase-admin');
  for (let i = 0; i < plan.length; i += 400) {
    const batch = db.batch();
    for (const p of plan.slice(i, i + 400)) batch.set(db.collection('programLevelSettings').doc(p.id), { protocolWeights: p.weights, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
  }
  console.log(`Written: ${plan.length} docs.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
