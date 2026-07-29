/**
 * scripts/audit-tabata-conditioning.ts
 *
 * RE-CURATION of the tabata pool to David's 29.07 rule (field test @L22 showed the
 * first pass was far too broad — it injected holds and slow strength: ישיבת L,
 * גוד מורנינג, דדליפט רומני, which do not belong in 20s×8).
 *
 * David's rule — the pool is CONDITIONING only:
 *   IN  = בטן (dynamic abs) + dynamic heart-rate-raising movements
 *         (מטפס הרים, סקוואט קפיצה, ברפי, אופניים, כפיפות בטן)
 *   OUT = החזקות (holds/isometrics), כוח איטי (slow strength),
 *         משקל-גוף כללי (general bodyweight: pushups/rows/squats/hinges)
 *   …and NOT abs-only — the dynamic full-body movements are the point.
 *
 * READ-ONLY by default. `--write-tags` re-tags `hiit_friendly` in Firestore to
 * exactly the proposed set (adds to newly-IN, REMOVES from newly-OUT) — only
 * after David approves the printed list.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/audit-tabata-conditioning.ts
 *   npx tsx --env-file=.env.local scripts/audit-tabata-conditioning.ts --write-tags
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const he = (n: any): string => (typeof n === 'string' ? n : (n?.he ?? n?.en ?? '?'));

/** Runtime level rule (mirrors poolLevelOf in tabata.block.ts): min targetPrograms
 *  level, or 1 when level-less (program-less gems default IN). */
const levelOf = (d: any): number => {
  const lv = (Array.isArray(d.targetPrograms) ? d.targetPrograms : [])
    .map((t: any) => t?.level).filter((n: any) => typeof n === 'number');
  return lv.length ? Math.min(...lv) : 1;
};

// ── Classification vocabulary ────────────────────────────────────────────────
// (A) Metabolic gems — full-body, heart-rate-raising. The heart of the pool.
//     Mostly domain-less (no targetPrograms) so they stay reachable at EVERY level.
const GEM = /סמוך קום|ברפי|הליכות דוב|הליכת דוב|הליכות זחל|הליכת זחל|הליכת סרטן|אופניים|ריצה במקום|קפיצות כוכב|ג['׳]?אק|jumping.?jack|ברכיים גבוה|סקיפ/i;
// (B) Plyometric / explosive — dynamic by construction, at any domain.
const JUMP = /קפיצ|מתפרץ|נתיר|פליומ|plyo|explosive/i;
// (C) Holds / isometrics — David: "לא החזקות". Hard OUT even inside core.
const HOLD = /החזק|ישיבת ל|ישיבת L|פלאנק|הולו|איזומטר|סטטי|תלייה מספרים|עמידת/i;
// Static-by-nature core names that HOLD misses.
const STATIC_CORE = /גליל בטן|ab.?wheel/i;
// (D) Removable / non-universal gear — a tabata member must not need kit that may
//     not be there, because there is no mid-block swap. (Carried over from the
//     25.07 curation rules.)
const GEAR_OUT = /טבעות|גומיי|גומייה|גומיה|רצועות|trx/i;
// (E) Max-effort skill work — explosive pull-ups / muscle-ups are near-max singles,
//     not 8×20s conditioning. Applied only OUTSIDE the core domain so hanging abs
//     (רגליים למתח / toes-to-bar, hanging knee raises) survive on their own merit.
// `מתח(?!יל)` — the pull-up bar, NOT מתחילים ("beginners", as in סמוך קום מתחילים).
const SKILL_OUT = /מתח(?!יל)|עליית כוח|מאסל|muscle.?up|pull.?up|דיפס|מקבילים|עמידת יד|פלאנץ|פרונט|דגל/i;

/** Domains that are general bodyweight / slow strength — OUT unless (A) or (B). */
const SLOW_DOMAINS = new Set([
  'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'squat',
]);

interface Row {
  id: string; name: string; level: number; mg: string; type: string;
  sweat: number | null; wasIn: boolean; reason: string;
}

function classify(d: any, name: string): { keep: boolean; reason: string } {
  const mg: string = d.movementGroup ?? '';
  const type: string = d.type ?? '';
  const sweat: number | null = typeof d.sweatLevel === 'number' ? d.sweatLevel : null;

  // Hard OUT: holds / isometrics, wherever they live.
  if (HOLD.test(name)) return { keep: false, reason: 'hold/isometric (David: לא החזקות)' };
  if (STATIC_CORE.test(name)) return { keep: false, reason: 'static/slow core (ab-wheel)' };
  // `type: 'time'` is the corpus marker for a prescribed hold.
  if (type === 'time') return { keep: false, reason: 'type=time → prescribed hold' };

  const isCore = mg === 'core' || d.primaryMuscle === 'core' || d.primaryMuscle === 'abs';

  // Hard OUT: removable gear, and max-effort skill work outside the core domain.
  if (GEAR_OUT.test(name)) return { keep: false, reason: 'removable gear (rings/band/straps — no mid-block swap)' };
  if (!isCore && SKILL_OUT.test(name)) return { keep: false, reason: 'max-effort skill (pull-up/muscle-up class)' };

  // IN (A): metabolic gem — the dynamic full-body core of the pool.
  if (GEM.test(name)) return { keep: true, reason: 'metabolic gem (full-body, HR-raising)' };
  // IN (B): plyometric / explosive at any domain.
  if (JUMP.test(name)) return { keep: true, reason: 'plyometric / explosive' };

  // IN (C): dynamic abs. `core` domain that survived the hold filters above.
  if (isCore) {
    if (sweat === 1) return { keep: false, reason: 'core but sweatLevel=1 (slow/controlled)' };
    return { keep: true, reason: 'dynamic abs' };
  }

  // OUT: everything else — general bodyweight + slow strength.
  if (SLOW_DOMAINS.has(mg)) return { keep: false, reason: `slow strength / general bodyweight (${mg})` };
  return { keep: false, reason: `no conditioning signal (mg:${mg || '—'})` };
}

async function main() {
  console.log(`\n🏷️  Tabata CONDITIONING re-curation (David 29.07) — project=${key.project_id}\n`);
  const snap = await db.collection('exercises').get();
  console.log(`Scanned ${snap.size} exercises.\n`);

  const keep: Row[] = [], drop: Row[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() as any;
    const name = he(d.name);
    const wasIn = (d.tags ?? []).includes('hiit_friendly');
    const { keep: k, reason } = classify(d, name);
    const row: Row = {
      id: doc.id, name, level: levelOf(d), mg: d.movementGroup ?? '—',
      type: d.type ?? '—', sweat: typeof d.sweatLevel === 'number' ? d.sweatLevel : null,
      wasIn, reason,
    };
    (k ? keep : drop).push(row);
  }

  const group = (rows: Row[]) => {
    const g = new Map<string, Row[]>();
    for (const r of rows) { if (!g.has(r.reason)) g.set(r.reason, []); g.get(r.reason)!.push(r); }
    return Array.from(g.entries()).sort((a, b) => b[1].length - a[1].length);
  };

  console.log(`══ PROPOSED POOL — IN (${keep.length}) ══\n`);
  for (const [reason, rows] of group(keep)) {
    console.log(`  ▸ ${reason} (${rows.length})`);
    for (const r of rows.sort((a, b) => a.level - b.level)) {
      console.log(`     L${String(r.level).padEnd(3)} ${r.name.padEnd(34)} ${r.wasIn ? '   ' : '🆕 '}(${r.id})`);
    }
    console.log('');
  }

  const removed = drop.filter((r) => r.wasIn);
  console.log(`══ REMOVED from the current 109 (${removed.length}) ══\n`);
  for (const [reason, rows] of group(removed)) {
    console.log(`  ▸ ${reason} (${rows.length})`);
    const show = rows.slice(0, 6).map((r) => r.name).join(' · ');
    console.log(`     ${show}${rows.length > 6 ? ` … +${rows.length - 6} more` : ''}\n`);
  }

  const added = keep.filter((r) => !r.wasIn);
  console.log(`══ ADDED vs the current 109 (${added.length}) ══`);
  for (const r of added) console.log(`     L${String(r.level).padEnd(3)} ${r.name}  (${r.id})`);

  // ── Depth check: the runtime needs ≥2 members at-or-below the user's level ──
  console.log(`\n══ DEPTH per user level (runtime needs ≥2 at-or-below) ══`);
  for (const lvl of [4, 6, 8, 10, 14, 18, 22]) {
    const n = keep.filter((r) => r.level <= lvl).length;
    console.log(`   userLevel ${String(lvl).padEnd(3)} → ${String(n).padEnd(3)} eligible ${n < 2 ? '❌ TOO THIN' : '✅'}`);
  }
  const levelless = keep.filter((r) => r.level === 1).length;
  console.log(`   (${levelless} of them sit at L1 — the always-reachable floor)`);

  console.log(`\n── FINAL: ${keep.length} IN · ${removed.length} removed · ${added.length} added`);
  console.log(`── ID array:\n${JSON.stringify(keep.map((r) => r.id))}\n`);

  if (!process.argv.includes('--write-tags')) {
    console.log('READ-ONLY — no writes. Re-run with --write-tags after David approves.\n');
    return;
  }

  console.log(`⚠️  WRITING tags — +${added.length} add, -${removed.length} remove…`);
  let n = 0;
  for (const r of added) {
    await db.collection('exercises').doc(r.id).set(
      { tags: admin.firestore.FieldValue.arrayUnion('hiit_friendly'), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    n++;
  }
  for (const r of removed) {
    await db.collection('exercises').doc(r.id).set(
      { tags: admin.firestore.FieldValue.arrayRemove('hiit_friendly'), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    n++;
  }
  console.log(`✅ Updated ${n} exercise doc(s). Pool is now ${keep.length}.\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
