/**
 * Handstand Triad scores → existing exercises (owner's ratings, 31.10.2026).
 *
 * DRY-RUN by default: reads the exercises and prints what would change.
 * Writes only with --apply (optionally --only=id1,id2 to limit the write).
 *
 * Per exercise it sets strengthScore / balanceScore / mobilityScore on the
 * handstand (or HSPU) targetPrograms row. The row's `level` is NOT changed,
 * so with HANDSTAND_TRIAD_ENABLED=false the generator keeps its current
 * behaviour, except the existing balance gate (balanceScore > 10 keeps an
 * exercise out of non-handstand push sessions); the report flags those rows.
 * An exercise with no handstand/HSPU row gets a new row (level = round avg of
 * the three scores, the admin editor's rule) and the program id in programIds:
 * this DOES add it to that program's pool, so the report marks it ADD.
 *
 * Source of the scores: appout-website/handstand-research (MAPPING.md,
 * PAGES-AND-PR.md "סולם גמישות"). Time variants (free 5/15/30s, wall holds)
 * use the entry variant's scores.
 *
 * Run: npx tsx --env-file=.env.local scripts/handstand-triad-scores.ts [--apply] [--only=a,b]
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const PROGRAM = { handstand: 'IOfBZFeorTTDkcz3tOA6', hspu: 'PAxprHuT7HjqrWU4wl0T' } as const;
type Prog = keyof typeof PROGRAM;

// [rated # in MAPPING.md, exerciseId, program row, S, B, M]
const SCORES: [string, string, Prog, number, number, number][] = [
  ['4', 'EnS9ade12iVKtUEDuiGW', 'handstand', 3, 1, 2],
  ['5/63', '9BBOvu1SNMzNxgPun8ZH', 'hspu', 4, 1, 3],
  ['6', 'XWL3TUAVmN0Dmp2btFgN', 'handstand', 5, 2, 8],
  ['7', 'BLbgAyNJSZCc4YsoOxtP', 'handstand', 5, 1, 1],
  ['10', 'FHh3m3suMMtoLk1PrxYv', 'handstand', 5, 1, 1],
  ['11', 'DnRgN3J7j5k6aTKX7lj3', 'handstand', 2, 1, 6],
  ['16-17', 'ANvq7ORET7uhLRK4XP6X', 'handstand', 7, 2, 4],
  ['18/19/26/27/72', 'PVqGiE3xg76Dg0EXUsqZ', 'handstand', 7, 2, 6],
  ['22/70', 'RPGCJ5BXPpPG21sF3H4y', 'handstand', 7, 3, 7],
  ['49-51', 'T95vtujpj07Tq4jRvRxf', 'handstand', 8, 14, 11],
  ['61', 'ecr0mBSRkTq6nQ8RVN91', 'hspu', 2, 1, 1],
  ['64', 'OaqZzXOBwfVmdJ99w3iC', 'hspu', 4, 2, 6],
  ['65', 'MwH75rBMKq65J9B86yUq', 'hspu', 6, 1, 5],
  ['66', 'WQBYjQxJEc9Y6FWHigTH', 'hspu', 5, 2, 6],
  ['67', 'wQ6ocm6HRKtQ7CFpZI6A', 'hspu', 7, 2, 6],
  ['68', '7G0s5hR2qyc6tSRZsplm', 'hspu', 8, 2, 6],
  ['69', 'lSQI6G75rS0OfZpIZOi3', 'hspu', 9, 2, 6],
  ['71', 'SO7k5qh04cKEoZmWbjeW', 'hspu', 10, 3, 7],
  ['73', '862hyZowOu16yxls8MWf', 'hspu', 11, 3, 9],
  ['75', 'HSYxn9dL4d9nUImW3Y7G', 'hspu', 12, 6, 4],
  ['76', '48r36be7y2dvotG4YKCM', 'hspu', 13, 3, 8],
  ['77', 'kb1MB9It40iDOrR1aacW', 'hspu', 11, 5, 10],
  ['78', 'W61ECyiZmD9APomgxAfz', 'hspu', 14, 4, 10],
  ['85', 'd7WlTqEJVeze9NNQS3fh', 'hspu', 15, 15, 15],
];

const BALANCE_GATE = 10;
const apply = process.argv.includes('--apply');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');

type Row = { programId: string; level: number; strengthScore?: number; balanceScore?: number; mobilityScore?: number };

async function main() {
  console.log(apply ? '⚠️  APPLY MODE: writing to Firestore' : 'DRY-RUN (no writes). Add --apply to write.');
  let changes = 0;
  for (const [num, id, prog, s, b, m] of SCORES) {
    if (only && !only.includes(id)) continue;
    const ref = db.collection('exercises').doc(id);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`#${num} ${id}: ❌ NOT FOUND`); continue; }
    const d = snap.data()!;
    const name = d.name?.he ?? d.name ?? id;
    const rows: Row[] = Array.isArray(d.targetPrograms) ? d.targetPrograms.map((r: Row) => ({ ...r })) : [];
    const pid = PROGRAM[prog];
    let idx = rows.findIndex((r) => r.programId === pid || r.programId === prog);
    let added = false;
    if (idx < 0) {
      rows.push({ programId: pid, level: Math.round((s + b + m) / 3) });
      idx = rows.length - 1;
      added = true;
    }
    const before = rows[idx];
    const same = before.strengthScore === s && before.balanceScore === b && before.mobilityScore === m;
    const tag = added ? 'ADD ROW' : same ? 'same' : 'UPDATE';
    const gate = b > BALANCE_GATE ? `  ⚑ balance ${b} > ${BALANCE_GATE}: leaves non-handstand push sessions` : '';
    console.log(
      `#${num} ${name} (${id}) [${prog}] ${tag}: ` +
        `${before.strengthScore ?? '-'}/${before.balanceScore ?? '-'}/${before.mobilityScore ?? '-'} → ${s}/${b}/${m}` +
        `, level ${before.level}${added ? ' (new)' : ' (kept)'}${gate}`,
    );
    if (same && !added) continue;
    changes++;
    if (!apply) continue;
    rows[idx] = { ...rows[idx], strengthScore: s, balanceScore: b, mobilityScore: m };
    const update: Record<string, unknown> = { targetPrograms: rows, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (added) update.programIds = admin.firestore.FieldValue.arrayUnion(pid);
    await ref.update(update);
    console.log('   ✓ written');
  }
  console.log(`\n${changes} exercise(s) ${apply ? 'written' : 'would change'}.`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
