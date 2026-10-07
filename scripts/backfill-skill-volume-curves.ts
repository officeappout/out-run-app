/**
 * scripts/backfill-skill-volume-curves.ts — 2026-10-06, REVISED v2.
 *
 * Supersedes scripts/backfill-skill-movement-pattern.ts (PR #158) — absorbs
 * its job (movementPattern, sourced from DOMAIN_RESOLUTION_SKILL_PARENT_MAP)
 * plus real per-level volume curves for the 7 skill-track programs.
 *
 * ============================================================================
 * REVISION v2 — locked decisions (David, 2026-10-06, after reviewing v1's
 * dry-run table)
 * ============================================================================
 * v1 scaled every skill's curve across a uniform 1-25 level range, matching
 * the Firestore catalog's nominal ceiling. That was wrong for two reasons
 * David corrected directly:
 *
 * 1. SCALE TO EACH SKILL'S OWN INTENDED (onboarding) CEILING, not the
 *    catalog max of 25. A skill's real top band only means something at the
 *    level a user actually reaches:
 *      planche = 15, handstand_pushup = 15
 *      front_lever = 13, one_arm_pullup = 13
 *      human_flag = 9
 *      handstand = 10, muscle_up = 10  (catalog max only — both currently
 *        have far fewer AUTHORED onboarding levels than that; handstand has
 *        0 today, confirmed live via getOnboardingLevelsForCategory
 *        (feature-flags.ts's HANDSTAND_ASSESSMENT_ENABLED comment). FLAGGED,
 *        not fixed here — missing top-level exercise content is a separate
 *        authoring backlog item, orthogonal to this volume-curve work. This
 *        script writes the full budget curve up to the ceiling regardless,
 *        so the numbers are ready the moment content catches up.)
 *
 * 2. PEAK VOLUME MUST SIT AT THE TOP BAND, NOT BE DILUTED. v1's COMMON_RAMP
 *    bands were pinned to ABSOLUTE level numbers (1-5/6-10/11-15/16-20/
 *    21-25) — fine for a skill that reaches L25, but for human_flag
 *    (ceiling=9) the user would NEVER leave band 2 (L6-10, weekly=10), so
 *    the practitioner's actual top-band target (weekly=24 before
 *    volumeFactor) would never be reached by anyone, ever — a silent taper
 *    baked into the band boundaries themselves, not the band values. Fixed
 *    by scaling the 5 COMMON_RAMP / 4 GAIN_TIERS band boundaries
 *    PROPORTIONALLY to each skill's own ceiling (scaleBandsToCeiling below)
 *    so band 5 (top) always ends exactly AT that skill's real final level —
 *    the band VALUES (weekly/maxSets/minSets/maxIntense/baseGain/
 *    firstSessionBonus) are unchanged from v1, only which levels map to
 *    which band changes.
 *
 * 3. CALIBRATION (David, advanced calisthenics practitioner, reconfirmed
 *    unchanged from v1): a full-skill hold set ≈ 4s ≈ ~2 reps; effective
 *    work at a level needs ~4-5 heavy sets; a real session MIXES adjacent
 *    levels (~3 sets current level + ~2 one below, i.e. the "4-5 heavy
 *    sets" above split across two adjacent levels in practice); realistic
 *    full session ≈ 8 straight-arm sets per skill, 3x/week ≈ 24 weekly
 *    peak. This is the SAME number v1's top band already targeted — #2
 *    above is what makes sure a real user (ceiling=9, 10, 13, or 15, never
 *    25) actually reaches it.
 *
 * ============================================================================
 * BUDGET SEMANTICS — what these fields actually count (verified live,
 * 2026-10-06, before writing a single new number — read this before
 * changing anything)
 * ============================================================================
 * `weeklyVolumeTarget` and `maxSets` are SESSION-WIDE / WEEK-WIDE TOTALS for
 * whichever program resolves as "lead" (resolveActiveProgramBudget) — never
 * per-exercise. For a TRUE combined multi-skill session (the
 * calisthenics_upper master path — what actually generates a "planche +
 * front_lever in one session" workout), home-workout.service.ts's
 * `buildAssessedDomainBudgets` used to compute each domain's PER-DOMAIN
 * weekly/daily allocation via the GENERIC `calculateWeeklyBudget(level) =
 * level*2` formula, never reading either skill's own `programLevelSettings.
 * weeklyVolumeTarget`. FIXED separately (see `buildAssessedDomainBudgets
 * FromRealSettings`, home-workout.service.ts, PR #168) — that fix is what
 * makes the numbers THIS script writes actually govern a combined
 * planche+front_lever session, not just a single-skill-focused one.
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
 *     which is anchored to the practitioner estimate above instead).
 *   - Bohm, Mersmann & Arampatzis (2015), Sports Medicine - Open 1:7 —
 *     tendon stiffness adaptation needs >70% MVC and an 8-14 week window
 *     (35/37 reviewed interventions); >=12 weeks meaningfully outperforms
 *     8-12. Still used for the per-level progression RATE (sessions/weeks
 *     per level via baseGain), not for capping weekly volume.
 *   - Rio et al. (2015), Br J Sports Med 49(19) — isometric loading protocol
 *     reference (5x45s @ 70% MVC).
 *
 * baseGain/firstSessionBonus are the REAL foundational push/pull curve
 * (verified live against Firestore: 8/6/4/2% baseGain, 3/3/1.5/1%
 * firstSessionBonus across the same four tiers), each scaled by a stated
 * per-skill GAIN_FACTOR below reflecting relative tendon/joint risk —
 * flagged as a judgment call, not independently cited.
 *
 * human_flag remains flagged: no credible primary literature exists for it
 * specifically; its numbers are a conservative placeholder.
 *
 * ============================================================================
 * WHAT THIS DOES NOT FIX
 * ============================================================================
 * Content-authoring gaps (handstand has 0, muscle_up has very few, authored
 * onboarding levels today) — separate, already tracked; this script writes
 * the curve up to each skill's INTENDED ceiling regardless of what content
 * exists yet. The HSPU_GENERATOR_EXCLUDED freeze — untouched.
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
// Band VALUES unchanged from v1. Band BOUNDARIES below are the "canonical"
// 1-25 shape — scaleBandsToCeiling remaps them per-skill so band 5 (top,
// weekly=24 = David's own estimate: 8 SA sets/session x 3 sessions/week,
// for planche/front_lever specifically at volumeFactor=1.0) always ends
// exactly at that skill's real ceiling, never beyond it.
// maxSets carries deliberate headroom above weekly/sessions-per-week (same
// ratio pattern as the real foundational curve) so it's a backstop, not a
// routine binding constraint.
// ============================================================================
const COMMON_RAMP_CANONICAL = [
  { loLevel: 1, hiLevel: 5, weekly: 6, maxSets: 10, minSets: 2 as number | null, maxIntense: 0 },
  { loLevel: 6, hiLevel: 10, weekly: 10, maxSets: 14, minSets: 3 as number | null, maxIntense: 1 },
  { loLevel: 11, hiLevel: 15, weekly: 16, maxSets: 18, minSets: null as number | null, maxIntense: 2 },
  { loLevel: 16, hiLevel: 20, weekly: 20, maxSets: 20, minSets: null as number | null, maxIntense: 2 },
  { loLevel: 21, hiLevel: 25, weekly: 24, maxSets: 22, minSets: null as number | null, maxIntense: 3 },
];

// Foundational gain tiers (real, verified live 2026-10-05/06 against push/pull).
// Same proportional remapping applies — otherwise no skill with ceiling<=15
// would ever reach the real foundational curve's bottom (slowest/most
// conservative) gain tier, which was pinned to absolute L20-25.
const GAIN_TIERS_CANONICAL = [
  { loLevel: 1, hiLevel: 5, baseGain: 8, firstSessionBonus: 3 },
  { loLevel: 6, hiLevel: 12, baseGain: 6, firstSessionBonus: 3 },
  { loLevel: 13, hiLevel: 19, baseGain: 4, firstSessionBonus: 1.5 },
  { loLevel: 20, hiLevel: 25, baseGain: 2, firstSessionBonus: 1 },
];

/**
 * Remaps a canonical (1-25-shaped) band table onto an arbitrary ceiling,
 * preserving band VALUES and relative ORDER but scaling boundaries so band
 * N (last) always ends exactly at `ceiling`. See REVISION v2 §2 above for
 * why this exists — a skill whose real ceiling never reaches L21 must still
 * reach the row carrying the top-band values, just at an earlier level.
 */
function scaleBandsToCeiling<T extends { loLevel: number; hiLevel: number }>(
  canonical: T[],
  ceiling: number,
): T[] {
  const n = canonical.length;
  let prevHi = 0;
  return canonical.map((band, i) => {
    const isLast = i === n - 1;
    const hi = isLast ? ceiling : Math.max(prevHi + 1, Math.round((ceiling * (i + 1)) / n));
    const lo = prevHi + 1;
    prevHi = hi;
    return { ...band, loLevel: lo, hiLevel: hi };
  });
}

interface SkillConfig {
  slug: string;
  ceiling: number;      // real intended onboarding ceiling (NOT catalog max of 25)
  volumeFactor: number; // multiplies weekly + maxSets from COMMON_RAMP
  gainFactor: number;   // multiplies baseGain + firstSessionBonus from GAIN_TIERS
  maxIntenseCeiling: number; // hard ceiling regardless of COMMON_RAMP band (per-skill risk)
  note: string;
}

const SKILLS: SkillConfig[] = [
  { slug: 'planche', ceiling: 15, volumeFactor: 1.0, gainFactor: 0.7, maxIntenseCeiling: 3, note: 'Reference skill for the practitioner estimate (8 SA sets/session, 3x/wk AT L15, the real ceiling). Dual tendon bottleneck (wrist extension + anterior shoulder) still reflected in the slower gainFactor, not in volume.' },
  { slug: 'front_lever', ceiling: 13, volumeFactor: 1.0, gainFactor: 0.8, maxIntenseCeiling: 3, note: 'Second reference skill for the same practitioner estimate (combined planche+front_lever session), top band now AT L13. Lat-dominant, no wrist-extension load -- least-cut gainFactor of the tendon-limited skills.' },
  { slug: 'handstand', ceiling: 10, volumeFactor: 1.1, gainFactor: 0.9, maxIntenseCeiling: 3, note: 'Least restricted -- neural/balance skill, not max-strength. Allowed slightly ABOVE the reference pair. Ceiling=10 is the CATALOG max only -- 0 real authored onboarding levels today (HANDSTAND_ASSESSMENT_ENABLED). Curve written now so it is ready the moment content is authored; not itself a content fix.' },
  { slug: 'handstand_pushup', ceiling: 15, volumeFactor: 0.9, gainFactor: 0.85, maxIntenseCeiling: 3, note: 'Bent-arm pressing, moderate risk. Same intended ceiling as planche (15). Currently frozen out of the generator entirely (HSPU_GENERATOR_EXCLUDED) pending a real HSPU ruleset -- untouched by this script.' },
  { slug: 'one_arm_pullup', ceiling: 13, volumeFactor: 0.85, gainFactor: 0.7, maxIntenseCeiling: 2, note: 'Unilateral transition doubles elbow/tendon load -- still the most conservative on PACE (gainFactor). Same intended ceiling as front_lever (13).' },
  { slug: 'muscle_up', ceiling: 10, volumeFactor: 0.85, gainFactor: 0.7, maxIntenseCeiling: 2, note: 'Explosive + uncontrolled eccentric shock -- unquantified rate-of-force risk kept the tightest maxIntenseCeiling of the 7. Ceiling=10 is the CATALOG max only -- authored onboarding-level content lags, same flag as handstand, separate backlog.' },
  { slug: 'human_flag', ceiling: 9, volumeFactor: 0.75, gainFactor: 0.75, maxIntenseCeiling: 2, note: 'WEAKEST EVIDENCE -- no credible primary literature specific to this skill. Conservative placeholder, revisit when better sources exist. Lowest ceiling of the 7 (9) -- the skill most affected by the v1 taper bug (would never have left band 2 under the old absolute-level bands).' },
];

function tierFor<T extends { loLevel: number; hiLevel: number }>(tiers: T[], level: number): T {
  return tiers.find((t) => level >= t.loLevel && level <= t.hiLevel) ?? tiers[tiers.length - 1];
}

function buildLevelRow(skill: SkillConfig, level: number, ramps: { ramp: typeof COMMON_RAMP_CANONICAL; gain: typeof GAIN_TIERS_CANONICAL }) {
  const ramp = tierFor(ramps.ramp, level);
  const gain = tierFor(ramps.gain, level);
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
    const ramp = scaleBandsToCeiling(COMMON_RAMP_CANONICAL, skill.ceiling);
    const gain = scaleBandsToCeiling(GAIN_TIERS_CANONICAL, skill.ceiling);
    return { skill, program, movementPattern, ramps: { ramp, gain } };
  });

  const missingProgram = targets.filter((t) => !t.program);
  if (missingProgram.length > 0) {
    console.error('❌ Could not resolve a programs doc for:', missingProgram.map((t) => t.skill.slug).join(', '));
    process.exit(1);
  }

  console.log(`Resolved all ${targets.length} skill programs:\n`);
  for (const { skill, program, movementPattern, ramps } of targets) {
    console.log(`${skill.slug} (${program!.id}, "${program!.name}") → movementPattern: ${movementPattern}, ceiling: L${skill.ceiling}, volumeFactor: ${skill.volumeFactor}, gainFactor: ${skill.gainFactor}`);
    console.log(`  ${skill.note}`);
    console.log(`  bands (weekly/maxSets): ${ramps.ramp.map((b) => `L${b.loLevel}-${b.hiLevel}`).join(', ')}`);
  }

  if (!isApply) {
    console.log('\n=== Per-skill level expansion (dry run, 1..ceiling — NOT a uniform 1..25) ===');
    for (const { skill, program, ramps } of targets) {
      console.log(`\n-- ${skill.slug} (${program!.id}), ceiling=L${skill.ceiling} --`);
      for (let level = 1; level <= skill.ceiling; level++) {
        const r = buildLevelRow(skill, level, ramps);
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
  for (const { skill, program, movementPattern, ramps } of targets) {
    await db.collection('programs').doc(program!.id).update({ movementPattern });
    console.log(`  ✓ ${skill.slug}: movementPattern → ${movementPattern}`);

    for (let level = 1; level <= skill.ceiling; level++) {
      const r = buildLevelRow(skill, level, ramps);
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
    console.log(`  ✓ ${skill.slug}: ${skill.ceiling} programLevelSettings docs written (L1-L${skill.ceiling}, merge:true -- existing fields preserved)`);
  }

  console.log('\n=== Post-write verification (re-read from DB, not the value sent) ===');
  for (const { skill, program, movementPattern } of targets) {
    const progDoc = await db.collection('programs').doc(program!.id).get();
    const plsDoc = await db.collection('programLevelSettings').doc(`${program!.id}_level_${skill.ceiling}`).get();
    const okPattern = progDoc.data()?.movementPattern === movementPattern;
    console.log(
      `  ${okPattern ? '✅' : '❌'} ${skill.slug}: movementPattern=${progDoc.data()?.movementPattern} | ` +
      `L${skill.ceiling} (top band) sample: weeklyVolumeTarget=${plsDoc.data()?.weeklyVolumeTarget} maxSets=${plsDoc.data()?.maxSets}`,
    );
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
