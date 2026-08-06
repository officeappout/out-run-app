/**
 * seed-level-equivalence-rules.ts
 * ---------------------------------------------------------------------------
 * Seeds `level_equivalence_rules` docs for the skill-suggestion cases from the
 * "מנוע-הצעות לתוכניות — סיור-מוחות (6.8.2026)" brainstorm, minus case 1
 * (muscle_up / AND push+pull) — that one has no confirmed threshold yet, so
 * it is intentionally NOT included here. Add it once a number is agreed.
 *
 * All 5 rules seeded here use `mode: 'suggest'` — per the OUT decision, these
 * write a pending suggestion (progression.pendingProgramSuggestions) only.
 * No track or activePrograms mutation happens automatically; nothing changes
 * for a real user until an acceptance flow (not built yet) is used.
 *
 * ⚠️  targetLevel IS NOT IN THE SOURCE TABLE — the brainstorm only specified
 *     the *source* threshold (e.g. "pull≥16 → suggest one_arm_pullup"), not
 *     what level one_arm_pullup should be suggested AT. Every rule below is
 *     seeded with a PLACEHOLDER `targetLevel: 1` and `TARGET_LEVEL_TODO` in
 *     its description. Do not run `--write` until real target-levels are
 *     confirmed and substituted in the RULES array below.
 *
 * ⚠️  TARGET PROJECT: `appout-1` — this is PRODUCTION. There is no separate
 *     staging project.
 *
 * ---------------------------------------------------------------------------
 * USAGE (nothing writes without an explicit --write flag):
 *   npx tsx scripts/seed-level-equivalence-rules.ts             # dry-run (default) — prints plan, NO writes
 *   npx tsx scripts/seed-level-equivalence-rules.ts --write      # actually write to Firestore
 *
 * Idempotent: deterministic docId `leq_<caseNumber>_<targetProgramId>` —
 * re-running with --write always merges (create-if-missing, update-if-exists),
 * never duplicates.
 * ---------------------------------------------------------------------------
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';

// ── CLI flags ────────────────────────────────────────────────────────────
const WRITE = process.argv.includes('--write');

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

// ── Rule definitions (cases 2-6 from the brainstorm table) ────────────────
interface SeedCondition {
  programId: string;
  minLevel: number;
}
interface SeedRule {
  caseNumber: number;
  targetProgramId: string;
  targetLevelTodo: number; // PLACEHOLDER — see file header. Replace before --write.
  conditions: SeedCondition[];
  logic: 'AND' | 'OR';
  description: string;
}

const RULES: SeedRule[] = [
  {
    caseNumber: 2,
    targetProgramId: 'handstand',
    targetLevelTodo: 1,
    conditions: [
      { programId: 'push', minLevel: 14 },
      { programId: 'planche', minLevel: 5 },
    ],
    logic: 'OR',
    description: '[TARGET_LEVEL_TODO] דחיפה≥14 או פלאנץ׳≥5 → הצעת עמידת ידיים',
  },
  {
    caseNumber: 3,
    targetProgramId: 'one_arm_pullup',
    targetLevelTodo: 1,
    conditions: [{ programId: 'pull', minLevel: 16 }],
    logic: 'AND',
    description: '[TARGET_LEVEL_TODO] משיכה≥16 → הצעת מתח יד אחת',
  },
  {
    caseNumber: 4,
    targetProgramId: 'front_lever',
    targetLevelTodo: 1,
    conditions: [{ programId: 'pull', minLevel: 14 }],
    logic: 'AND',
    description: '[TARGET_LEVEL_TODO] משיכה≥14 → הצעת פרונט לוור',
  },
  {
    caseNumber: 5,
    targetProgramId: 'planche',
    targetLevelTodo: 1,
    conditions: [{ programId: 'push', minLevel: 16 }],
    logic: 'AND',
    description: '[TARGET_LEVEL_TODO] דחיפה≥16 → הצעת פלאנץ׳',
  },
  {
    caseNumber: 6,
    // 'hspu' — not 'handstand_pushup'. The program doc's own `slug` field is
    // unset (Firestore); 'hspu' is what program-path/page.tsx:41 (the actual
    // picker a new user sees) and CANONICAL_PROGRAM_SLUGS
    // (onboarding-sync.service.ts:55) both use. 'handstand_pushup' only shows
    // up in SKILL_TO_FOUNDATION_DOMAIN (onboarding-sync.service.ts:90) — a
    // second, inconsistent code-name for the same program that exists
    // elsewhere in the codebase; not touched here, just avoided.
    targetProgramId: 'hspu',
    targetLevelTodo: 1,
    conditions: [{ programId: 'push', minLevel: 17 }],
    logic: 'AND',
    description: '[TARGET_LEVEL_TODO] דחיפה≥17 → הצעת שכיבות סמיכה בעמידת ידיים',
  },
];

async function main() {
  console.log(WRITE ? '⚠️  WRITE MODE — will write to production Firestore' : '🔍 DRY RUN — no writes (pass --write to actually seed)');
  console.log(`${RULES.length} rule(s) to seed (case 1 / muscle_up intentionally excluded — no confirmed threshold)\n`);

  if (WRITE) init();
  const db = WRITE ? admin.firestore() : null;

  for (const rule of RULES) {
    const docId = `leq_${rule.caseNumber}_${rule.targetProgramId}`;
    const payload = {
      id: docId,
      conditions: rule.conditions,
      logic: rule.logic,
      sourceProgramIds: rule.conditions.map(c => c.programId),
      ...(rule.conditions.length === 1
        ? { sourceProgramId: rule.conditions[0].programId, sourceLevel: rule.conditions[0].minLevel }
        : { sourceProgramId: null, sourceLevel: null }),
      targetProgramId: rule.targetProgramId,
      targetLevel: rule.targetLevelTodo,
      targetPercent: 0,
      mode: 'suggest' as const,
      addToActivePrograms: false, // irrelevant in suggest mode, explicit for clarity
      description: rule.description,
      isEnabled: true,
    };

    console.log(`[case ${rule.caseNumber}] ${docId}`);
    console.log(
      `  ${rule.conditions.map(c => `${c.programId}≥${c.minLevel}`).join(rule.logic === 'AND' ? ' וגם ' : ' או ')}` +
      ` → ${rule.targetProgramId} (targetLevel=${rule.targetLevelTodo} ⚠️ PLACEHOLDER)`,
    );

    if (WRITE && db) {
      await db.collection('level_equivalence_rules').doc(docId).set(
        {
          ...payload,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      console.log('  ✓ written');
    }
    console.log('');
  }

  if (!WRITE) {
    console.log('Dry run complete. Re-run with --write once targetLevel placeholders are confirmed and replaced.');
  } else {
    console.log('Seed complete.');
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
