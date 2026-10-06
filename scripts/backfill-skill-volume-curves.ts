/**
 * scripts/backfill-skill-volume-curves.ts — 2026-10-06, REVISED.
 *
 * Supersedes scripts/backfill-skill-movement-pattern.ts (PR #158) — absorbs
 * its job (movementPattern, sourced from DOMAIN_RESOLUTION_SKILL_PARENT_MAP)
 * plus real per-level volume curves for the 7 skill-track programs.
 *
 * ============================================================================
 * REVISION NOTE (first pass was too conservative — corrected per product
 * owner, an advanced calisthenics practitioner)
 * ============================================================================
 * The first version erred low for a GENERAL population. Correction: skill
 * tracks are advanced-only by definition (nobody starts on planche) — the
 * target users ARE the advanced cohort, so general-population conservatism
 * doesn't apply at the bands advanced users actually train at. Realistic
 * anchor (experienced practitioner's own estimate, not a literature number —
 * that's what the research below is FOR): a combined planche + front_lever
 * session, supersetted holds + presses/pulls, ~8 straight-arm sets per skill
 * per session (~16 SA sets total), ~3x/week. This revision targets that
 * explicitly at the top bands, with a conservative ramp preserved at L1-5
 * for progressive tendon loading.
 *
 * ============================================================================
 * BUDGET SEMANTICS — what these fields actually count (verified live,
 * 2026-10-06, before writing a single new number — read this before
 * changing anything)
 * ============================================================================
 * `weeklyVolumeTarget` and `maxSets` are SESSION-WIDE / WEEK-WIDE TOTALS for
 * whichever program resolves as "lead" (resolveActiveProgramBudget) — never
 * per-exercise, and `maxSets` specifically has NO per-domain variant
 * anywhere in this codebase (DomainBudgetEntry carries no maxSets field at
 * all) — it is always ONE flat ceiling applied to the whole session's total
 * main-exercise set count, however many domains/skills are blended into it.
 *
 * For a TRUE combined multi-skill session (the calisthenics_upper /
 * upper_body / full_body MASTER paths — this is what actually generates a
 * "planche + front_lever in one session" workout), home-workout.service.ts's
 * `buildAssessedDomainBudgets` computes each domain's PER-DOMAIN weekly/daily
 * allocation via the GENERIC `calculateWeeklyBudget(level) = level*2`
 * formula — it does NOT read either skill's own `programLevelSettings.
 * weeklyVolumeTarget`. And the session-WIDE `maxSets` backstop still comes
 * from `resolveActiveProgramBudget`, keyed on `activePrograms[0].templateId`
 * — for a calisthenics_upper session that id IS the master program itself
 * (isMaster:true, no movementPattern), which resolves via the #154
 * safety-net default (generic tier default by overall level), NOT from
 * either skill's own curve.
 *
 * CONSEQUENCE: the numbers below are confirmed to take effect for a
 * genuinely SINGLE-skill-focused session (one skill is the user's only
 * active program — resolveActiveProgramBudget -> resolveLeadProgramBudget
 * reads that skill's own PLS doc directly, confirmed in the #154 PR's own
 * test). They do NOT yet govern the TRUE multi-skill combined-session case
 * (calisthenics_upper) David described — that needs a SEPARATE, NOT-YET-
 * BUILT fix (wire buildAssessedDomainBudgets to read real PLS values per
 * domain instead of the generic formula; and/or give the master-session
 * path its own per-domain maxSets instead of one flat master-level value).
 * Flagged here explicitly rather than silently built — out of scope for
 * this backfill, a decision for David.
 *
 * ============================================================================
 * SOURCES — do not change a number without updating this block
 * ============================================================================
 *   - Steven Low, "Overcoming Gravity" 2nd ed. + stevenlow.org articles
 *     (Prilepin tables for isometric/eccentric bodyweight work; isometric
 *     session TUT sweet spot ~40-65s at 60-70% max hold; eccentric volume =
 *     ~3x isometric; strength-rep session volume 25-50 reps).
 *   - Steven Low, "Overcoming Tendonitis" (tendon adaptation lags muscle
 *     adaptation by months vs weeks; tendinopathy = volume > recovery
 *     capacity — informs the conservative L1-5 ramp, not the top-band target,
 *     which is now anchored to the practitioner estimate above instead).
 *   - Bohm, Mersmann & Arampatzis (2015), Sports Medicine - Open 1:7 —
 *     tendon stiffness adaptation needs >70% MVC and an 8-14 week window
 *     (35/37 reviewed interventions); >=12 weeks meaningfully outperforms
 *     8-12. Still used for the per-level progression RATE (sessions/weeks
 *     per level via baseGain), not for capping weekly volume this time.
 *   - Rio et al. (2015), Br J Sports Med 49(19) — isometric loading protocol
 *     reference (5x45s @ 70% MVC).
 *
 * baseGain/firstSessionBonus are the REAL foundational push/pull curve
 * (verified live against Firestore: 8/6/4/2% baseGain, 3/3/1.5/1%
 * firstSessionBonus across the same four tiers), each scaled by a stated
 * per-skill GAIN_FACTOR below reflecting relative tendon/joint risk —
 * flagged as a judgment call, not independently cited, same as before.
 *
 * human_flag remains flagged: no credible primary literature exists for it
 * specifically; its numbers are a conservative placeholder.
 *
 * ============================================================================
 * WHAT THIS DOES NOT FIX
 * ============================================================================
 * The calisthenics_upper combined-session gap described above. Content-
 * authoring gaps (handstand + muscle_up have 0 authored onboarding levels)
 * — separate, already tracked. The HSPU_GENERATOR_EXCLUDED freeze — untouched.
 *
 * Usage:
 *   npx tsx scripts/backfill-skill-volume-curves.ts            (dry run)
 *   npx tsx scripts/backfill-skill-volume-curves.ts --apply    (writes)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';

// ============================================================================
// Common ramp (sets/week, session-cap) BEFORE each skill's VOLUME_FACTOR.
// Top band (L21-25) weekly=24 = David's own estimate (8 SA sets/session x 3
// sessions/week) for planche/front_lever specifically (VOLUME_FACTOR=1.0).
// maxSets carries deliberate headroom above weekly/sessions-per-week (same
// ratio pattern as the real foundational curve) so it's a backstop, not a
// routine binding constraint.
// ============================================================================
const COMMON_RAMP = [
  { loLevel: 1, hiLevel: 5, weekly: 6, maxSets: 10, minSets: 2 as number | null, maxIntense: 0 },
  { loLevel: 6, hiLevel: 10, weekly: 10, maxSets: 14, minSets: 3 as number | null, maxIntense: 1 },
  { loLevel: 11, hiLevel: 15, weekly: 16, maxSets: 18, minSets: null as number | null, maxIntense: 2 },
  { loLevel: 16, hiLevel: 20, weekly: 20, maxSets: 20, minSets: null as number | null, maxIntense: 2 },
  { loLevel: 21, hiLevel: 25, weekly: 24, maxSets: 22, minSets: null as number | null, maxIntense: 3 },
];

// Foundational gain tiers (real, verified live 2026-10-05/06 against push/pull):
const GAIN_TIERS = [
  { loLevel: 1, hiLevel: 5, baseGain: 8, firstSessionBonus: 3 },
  { loLevel: 6, hiLevel: 12, baseGain: 6, firstSessionBonus: 3 },
  { loLevel: 13, hiLevel: 19, baseGain: 4, firstSessionBonus: 1.5 },
  { loLevel: 20, hiLevel: 25, baseGain: 2, firstSessionBonus: 1 },
];

interface SkillConfig {
  slug: string;
  volumeFactor: number; // multiplies weekly + maxSets from COMMON_RAMP
  gainFactor: number;   // multiplies baseGain + firstSessionBonus from GAIN_TIERS
  maxIntenseCeiling: number; // hard ceiling regardless of COMMON_RAMP band (per-skill risk)
  note: string;
}

const SKILLS: SkillConfig[] = [
  { slug: 'planche', volumeFactor: 1.0, gainFactor: 0.7, maxIntenseCeiling: 3, note: 'Reference skill for the practitioner estimate (8 SA sets/session, 3x/wk at top band). Dual tendon bottleneck (wrist extension + anterior shoulder) still reflected in the slower gainFactor, not in volume.' },
  { slug: 'front_lever', volumeFactor: 1.0, gainFactor: 0.8, maxIntenseCeiling: 3, note: 'Second reference skill for the same practitioner estimate (combined planche+front_lever session). Lat-dominant, no wrist-extension load -- least-cut gainFactor of the tendon-limited skills.' },
  { slug: 'handstand', volumeFactor: 1.1, gainFactor: 0.9, maxIntenseCeiling: 3, note: 'Least restricted -- neural/balance skill, not max-strength. Allowed slightly ABOVE the reference pair.' },
  { slug: 'handstand_pushup', volumeFactor: 0.9, gainFactor: 0.85, maxIntenseCeiling: 3, note: 'Bent-arm pressing, moderate risk.' },
  { slug: 'one_arm_pullup', volumeFactor: 0.85, gainFactor: 0.7, maxIntenseCeiling: 2, note: 'Unilateral transition doubles elbow/tendon load -- still the most conservative on PACE (gainFactor), volume brought up with the others per the correction.' },
  { slug: 'muscle_up', volumeFactor: 0.85, gainFactor: 0.7, maxIntenseCeiling: 2, note: 'Explosive + uncontrolled eccentric shock -- unquantified rate-of-force risk kept the tightest maxIntenseCeiling of the 7.' },
  { slug: 'human_flag', volumeFactor: 0.75, gainFactor: 0.75, maxIntenseCeiling: 2, note: 'WEAKEST EVIDENCE -- no credible primary literature specific to this skill. Conservative placeholder, revisit when better sources exist.' },
];

function tierFor<T extends { loLevel: number; hiLevel: number }>(tiers: T[], level: number): T {
  return tiers.find((t) => level >= t.loLevel && level <= t.hiLevel) ?? tiers[tiers.length - 1];
}

function buildLevelRow(skill: SkillConfig, level: number) {
  const ramp = tierFor(COMMON_RAMP, level);
  const gain = tierFor(GAIN_TIERS, level);
  return {
    level,
    weeklyVolumeTarget: Math.round(ramp.weekly * skill.volumeFactor),
    maxSets: Math.round(ramp.maxSets * skill.volumeFactor),
    minSets: ramp.minSets,
    baseGain: Math.round(gain.baseGain * skill.gainFactor * 10) / 10,
    firstSessionBonus: Math.round(gain.firstSessionBonus * skill.gainFactor * 10) / 10,
    maxIntenseWorkoutsPerWeek: Math.min(ramp.maxIntense, skill.maxIntenseCeiling),
  };
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not set.'); process.exit(1); }
  const cred = JSON.parse(rawKey);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  const db = admin.firestore();

  const { DOMAIN_RESOLUTION_SKILL_PARENT_MAP } = await import('../src/features/workout-engine/logic/workout-selection.utils');
  const { resolveToSlug, buildIdToSlugMapFromPrograms } = await import('../src/features/workout-engine/services/program-hierarchy.utils');
  const { getAllPrograms } = await import('../src/features/content/programs/core/program.service');

  const programs = await getAllPrograms();
  buildIdToSlugMapFromPrograms(programs);

  const targets = SKILLS.map((skill) => {
    const program = programs.find((p) => resolveToSlug(p.id) === skill.slug);
    const movementPattern = (DOMAIN_RESOLUTION_SKILL_PARENT_MAP as Record<string, string>)[skill.slug];
    return { skill, program, movementPattern };
  });

  const missingProgram = targets.filter((t) => !t.program);
  if (missingProgram.length > 0) {
    console.error('❌ Could not resolve a programs doc for:', missingProgram.map((t) => t.skill.slug).join(', '));
    process.exit(1);
  }

  console.log(`Resolved all ${targets.length} skill programs:\n`);
  for (const { skill, program, movementPattern } of targets) {
    console.log(`${skill.slug} (${program!.id}, "${program!.name}") → movementPattern: ${movementPattern}, volumeFactor: ${skill.volumeFactor}, gainFactor: ${skill.gainFactor}`);
    console.log(`  ${skill.note}`);
  }

  if (!isApply) {
    console.log('\n=== Full 25-level expansion (dry run) ===');
    for (const { skill, program } of targets) {
      console.log(`\n-- ${skill.slug} (${program!.id}) --`);
      for (let level = 1; level <= 25; level++) {
        const r = buildLevelRow(skill, level);
        console.log(
          `  L${r.level}: weeklyVolumeTarget=${r.weeklyVolumeTarget} maxSets=${r.maxSets} ` +
          `minSets=${r.minSets ?? 'undefined'} baseGain=${r.baseGain} firstSessionBonus=${r.firstSessionBonus} ` +
          `maxIntenseWorkoutsPerWeek=${r.maxIntenseWorkoutsPerWeek}`,
        );
      }
    }
    console.log('\nDry run only (pass --apply to write). No Firestore writes made.');
    process.exit(0);
  }

  console.log('\n=== Pre-write snapshot ===');
  for (const { skill, program } of targets) {
    const doc = await db.collection('programs').doc(program!.id).get();
    console.log(`  ${skill.slug}: movementPattern was ${JSON.stringify(doc.data()?.movementPattern ?? null)}`);
  }

  console.log('\n=== Writing ===');
  for (const { skill, program, movementPattern } of targets) {
    await db.collection('programs').doc(program!.id).update({ movementPattern });
    console.log(`  ✓ ${skill.slug}: movementPattern → ${movementPattern}`);

    for (let level = 1; level <= 25; level++) {
      const r = buildLevelRow(skill, level);
      const docId = `${program!.id}_level_${level}`;
      const payload: Record<string, unknown> = {
        programId: program!.id,
        levelNumber: level,
        weeklyVolumeTarget: r.weeklyVolumeTarget,
        maxSets: r.maxSets,
        baseGain: r.baseGain,
        firstSessionBonus: r.firstSessionBonus,
        maxIntenseWorkoutsPerWeek: r.maxIntenseWorkoutsPerWeek,
      };
      if (r.minSets != null) payload.minSets = r.minSets;
      await db.collection('programLevelSettings').doc(docId).set(payload, { merge: true });
    }
    console.log(`  ✓ ${skill.slug}: 25 programLevelSettings docs written (merge:true -- existing fields preserved)`);
  }

  console.log('\n=== Post-write verification (re-read from DB, not the value sent) ===');
  for (const { skill, program, movementPattern } of targets) {
    const progDoc = await db.collection('programs').doc(program!.id).get();
    const plsDoc = await db.collection('programLevelSettings').doc(`${program!.id}_level_22`).get();
    const okPattern = progDoc.data()?.movementPattern === movementPattern;
    console.log(
      `  ${okPattern ? '✅' : '❌'} ${skill.slug}: movementPattern=${progDoc.data()?.movementPattern} | ` +
      `L22 sample: weeklyVolumeTarget=${plsDoc.data()?.weeklyVolumeTarget} maxSets=${plsDoc.data()?.maxSets}`,
    );
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
