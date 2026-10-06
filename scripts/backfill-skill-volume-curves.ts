/**
 * scripts/backfill-skill-volume-curves.ts — 2026-10-06.
 *
 * Supersedes scripts/backfill-skill-movement-pattern.ts (PR #158) — absorbs
 * its job (movementPattern, sourced the same way, from
 * DOMAIN_RESOLUTION_SKILL_PARENT_MAP) plus real per-level volume curves for
 * the same 7 skill-track programs, so movementPattern backfilling is no
 * longer the cosmetic no-op that PR documented it as.
 *
 * ============================================================================
 * SOURCES — do not change a number without updating this block
 * ============================================================================
 * Research + direct Firestore anchoring, 2026-10-06. Full writeup delivered
 * separately (not in this file) — summary of what's cited vs synthesized:
 *
 *   - Steven Low, "Overcoming Gravity" 2nd ed. + stevenlow.org articles
 *     (Prilepin tables for isometric/eccentric bodyweight work; isometric
 *     session TUT sweet spot ~40-65s at 60-70% max hold; eccentric volume =
 *     ~3x isometric; strength-rep session volume 25-50 reps).
 *   - Steven Low, "Overcoming Tendonitis" (tendon adaptation lags muscle
 *     adaptation by months vs weeks; tendinopathy = volume > recovery
 *     capacity; this is the primary justification for "err low").
 *   - Bohm, Mersmann & Arampatzis (2015), Sports Medicine - Open 1:7 —
 *     tendon stiffness adaptation needs >70% MVC and an 8-14 week window
 *     (35/37 reviewed interventions); >=12 weeks meaningfully outperforms
 *     8-12. This sets the MINIMUM weeks-per-level floor used below for the
 *     five tendon-limited skills (planche/front_lever/handstand_pushup/
 *     one_arm_pullup/muscle_up) at their higher bands.
 *   - Rio et al. (2015), Br J Sports Med 49(19) — isometric loading protocol
 *     reference (5x45s @ 70% MVC), used for handstand/planche hold framing.
 *
 * UNIT CONVERSION (the one judgment-heavy step — stated explicitly so it can
 * be checked): this system's weeklyVolumeTarget/maxSets are a SET COUNT, not
 * a duration. Research for isometric holds (planche/front_lever/human_flag)
 * is expressed as weekly time-under-tension (TUT) in seconds. Converted via
 * assumed seconds-per-working-set at that band (drawn from the SAME Low
 * tables' own per-exercise prescriptions, e.g. "4-5x13s", "6x7s") — stated
 * per band below. Handstand is graded the same way despite being a
 * neural/balance skill, not a max-strength one, because this system's
 * generator only has one volume currency (sets in a structured session);
 * this is a stated LIMITATION, not a hidden assumption — handstand's real
 * value also comes from short, frequent out-of-session practice this field
 * cannot capture. HSPU/one_arm_pullup/muscle_up research is already
 * rep/set-based — no conversion needed there.
 *
 * baseGain/firstSessionBonus are NOT separately sourced from the exercise-
 * science research (that research has nothing to say about this app's XP
 * formula) — they're the REAL foundational push/pull curve's own bands
 * (verified live against Firestore, 2026-10-06: 8/6/4/2 % baseGain,
 * 3/3/1.5/1 % firstSessionBonus across the same four tiers), each scaled
 * down by a single stated per-skill SLOWDOWN_FACTOR below, reflecting
 * research's qualitative "weeks per level" ranking (most conservative:
 * planche, one_arm_pullup, muscle_up; least: handstand). This factor is a
 * judgment call translating "progress should be slower" into this specific
 * field — flagged as such, not presented as independently cited.
 *
 * minSets and maxIntenseWorkoutsPerWeek are likewise anchored to the real
 * foundational bands (4/6/undefined; 0/1/2/3) and pulled down for the same
 * conservative reason -- no skill here is proposed above maxIntense=2
 * (foundational elite real value is 3; the generic code fallback for an
 * unconfigured program is 99 -- both are deliberately NOT used for any
 * skill band).
 *
 * ============================================================================
 * WHAT THIS DOES NOT FIX
 * ============================================================================
 * Content-authoring gaps (handstand + muscle_up have 0 authored onboarding
 * levels; front_lever/one_arm_pullup cap at L13 authored content) are a
 * SEPARATE, already-tracked issue -- this script populates the VOLUME
 * BUDGET fields for all 25 levels regardless, so the data is correct
 * whenever/if that content gap closes, but does not itself close it.
 * handstand/handstand_pushup remain frozen (HSPU_GENERATOR_EXCLUDED) --
 * this backfill does not touch that flag.
 *
 * Usage:
 *   npx tsx scripts/backfill-skill-volume-curves.ts            (dry run)
 *   npx tsx scripts/backfill-skill-volume-curves.ts --apply    (writes)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';

// ============================================================================
// Band definitions -- the reviewable part. One row per skill per band.
// ============================================================================
interface Band {
  loLevel: number;
  hiLevel: number;
  weeklyVolumeTarget: number; // sets/week, held roughly flat across the band (see interpolation below)
  maxSets: number;            // safety-brake ceiling per session
  minSets: number | null;     // null = field omitted, matching foundational's own L13+ behavior
  baseGain: number;           // %, matches foundational tier before SLOWDOWN_FACTOR
  firstSessionBonus: number;  // %, matches foundational tier before SLOWDOWN_FACTOR
  maxIntenseWorkoutsPerWeek: number;
}

interface SkillCurve {
  slug: string;
  slowdownFactor: number; // applied to baseGain + firstSessionBonus only
  bands: Band[];
}

// Foundational tiers (real, verified live 2026-10-06 against push/pull):
// baseGain   8 / 6 / 4 / 2   (L1-5 / L6-12 / L13-19 / L20-25)
// firstSessionBonus 3 / 3 / 1.5 / 1 (same tiers)
const CURVES: SkillCurve[] = [
  {
    slug: 'planche', // most conservative -- dual tendon bottleneck (wrist extension + anterior shoulder)
    slowdownFactor: 0.6,
    bands: [
      { loLevel: 1, hiLevel: 5, weeklyVolumeTarget: 10, maxSets: 5, minSets: 2, baseGain: 8, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 0 },
      { loLevel: 6, hiLevel: 10, weeklyVolumeTarget: 10, maxSets: 6, minSets: 3, baseGain: 6, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 11, hiLevel: 15, weeklyVolumeTarget: 10, maxSets: 5, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 16, hiLevel: 20, weeklyVolumeTarget: 10, maxSets: 4, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 21, hiLevel: 25, weeklyVolumeTarget: 9, maxSets: 4, minSets: null, baseGain: 2, firstSessionBonus: 1, maxIntenseWorkoutsPerWeek: 1 },
    ],
  },
  {
    slug: 'front_lever', // one notch less conservative than planche -- lat-dominant, no wrist-extension load
    slowdownFactor: 0.7,
    bands: [
      { loLevel: 1, hiLevel: 5, weeklyVolumeTarget: 12, maxSets: 6, minSets: 3, baseGain: 8, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 0 },
      { loLevel: 6, hiLevel: 10, weeklyVolumeTarget: 12, maxSets: 6, minSets: 4, baseGain: 6, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 11, hiLevel: 15, weeklyVolumeTarget: 11, maxSets: 5, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 16, hiLevel: 20, weeklyVolumeTarget: 10, maxSets: 5, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 2 },
      { loLevel: 21, hiLevel: 25, weeklyVolumeTarget: 10, maxSets: 4, minSets: null, baseGain: 2, firstSessionBonus: 1, maxIntenseWorkoutsPerWeek: 2 },
    ],
  },
  {
    slug: 'handstand', // least restricted -- neural/balance skill, not max-strength; see unit-conversion limitation above
    slowdownFactor: 0.85,
    bands: [
      { loLevel: 1, hiLevel: 5, weeklyVolumeTarget: 12, maxSets: 8, minSets: 3, baseGain: 8, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 6, hiLevel: 10, weeklyVolumeTarget: 14, maxSets: 10, minSets: 4, baseGain: 6, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 11, hiLevel: 15, weeklyVolumeTarget: 16, maxSets: 10, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 2 },
      { loLevel: 16, hiLevel: 20, weeklyVolumeTarget: 16, maxSets: 8, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 2 },
      { loLevel: 21, hiLevel: 25, weeklyVolumeTarget: 14, maxSets: 6, minSets: null, baseGain: 2, firstSessionBonus: 1, maxIntenseWorkoutsPerWeek: 2 },
    ],
  },
  {
    slug: 'handstand_pushup', // bent-arm pressing, moderate risk -- research gives weekly SETS directly, no TUT conversion
    slowdownFactor: 0.75,
    bands: [
      { loLevel: 1, hiLevel: 5, weeklyVolumeTarget: 10, maxSets: 4, minSets: 2, baseGain: 8, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 0 },
      { loLevel: 6, hiLevel: 10, weeklyVolumeTarget: 10, maxSets: 4, minSets: 3, baseGain: 6, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 11, hiLevel: 15, weeklyVolumeTarget: 10, maxSets: 4, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 16, hiLevel: 20, weeklyVolumeTarget: 8, maxSets: 4, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 2 },
      { loLevel: 21, hiLevel: 25, weeklyVolumeTarget: 6, maxSets: 3, minSets: null, baseGain: 2, firstSessionBonus: 1, maxIntenseWorkoutsPerWeek: 2 },
    ],
  },
  {
    slug: 'one_arm_pullup', // slowest elite progression of all 7 -- unilateral transition is an overnight load-doubling on elbow/distal-biceps tendon
    slowdownFactor: 0.6,
    bands: [
      { loLevel: 1, hiLevel: 5, weeklyVolumeTarget: 12, maxSets: 5, minSets: 2, baseGain: 8, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 0 },
      { loLevel: 6, hiLevel: 10, weeklyVolumeTarget: 10, maxSets: 5, minSets: 3, baseGain: 6, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 11, hiLevel: 15, weeklyVolumeTarget: 8, maxSets: 4, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 16, hiLevel: 20, weeklyVolumeTarget: 6, maxSets: 4, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 21, hiLevel: 25, weeklyVolumeTarget: 6, maxSets: 3, minSets: null, baseGain: 2, firstSessionBonus: 1, maxIntenseWorkoutsPerWeek: 1 },
    ],
  },
  {
    slug: 'muscle_up', // tightest PER-SESSION cap of all 7 -- explosive concentric + uncontrolled eccentric shock at the transition; unquantified rate-of-force risk
    slowdownFactor: 0.6,
    bands: [
      { loLevel: 1, hiLevel: 5, weeklyVolumeTarget: 6, maxSets: 5, minSets: 2, baseGain: 8, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 0 },
      { loLevel: 6, hiLevel: 10, weeklyVolumeTarget: 8, maxSets: 5, minSets: 3, baseGain: 6, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 11, hiLevel: 15, weeklyVolumeTarget: 8, maxSets: 4, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 16, hiLevel: 20, weeklyVolumeTarget: 6, maxSets: 4, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 21, hiLevel: 25, weeklyVolumeTarget: 6, maxSets: 3, minSets: null, baseGain: 2, firstSessionBonus: 1, maxIntenseWorkoutsPerWeek: 1 },
    ],
  },
  {
    slug: 'human_flag', // WEAKEST EVIDENCE of the 7 -- no credible primary literature specific to this skill; numbers are a conservative placeholder, revisit when better sources exist
    slowdownFactor: 0.65,
    bands: [
      { loLevel: 1, hiLevel: 5, weeklyVolumeTarget: 8, maxSets: 5, minSets: 2, baseGain: 8, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 0 },
      { loLevel: 6, hiLevel: 10, weeklyVolumeTarget: 10, maxSets: 5, minSets: 3, baseGain: 6, firstSessionBonus: 3, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 11, hiLevel: 15, weeklyVolumeTarget: 8, maxSets: 5, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 16, hiLevel: 20, weeklyVolumeTarget: 8, maxSets: 4, minSets: null, baseGain: 4, firstSessionBonus: 1.5, maxIntenseWorkoutsPerWeek: 1 },
      { loLevel: 21, hiLevel: 25, weeklyVolumeTarget: 8, maxSets: 4, minSets: null, baseGain: 2, firstSessionBonus: 1, maxIntenseWorkoutsPerWeek: 1 },
    ],
  },
];

function bandFor(curve: SkillCurve, level: number): Band {
  return curve.bands.find((b) => level >= b.loLevel && level <= b.hiLevel) ?? curve.bands[curve.bands.length - 1];
}

/** Smooth weeklyVolumeTarget within a band (matches the real foundational
 *  curve's own gentle per-level climb) by linearly interpolating toward the
 *  NEXT band's value across the last 2 levels of the current band. Every
 *  other field steps at the band boundary exactly, matching how baseGain/
 *  maxSets/firstSessionBonus behave in the real push/pull data. */
function expandToLevels(curve: SkillCurve): Array<Band & { level: number }> {
  const rows: Array<Band & { level: number }> = [];
  for (let level = 1; level <= 25; level++) {
    const band = bandFor(curve, level);
    const nextBand = curve.bands[curve.bands.indexOf(band) + 1];
    let weeklyVolumeTarget = band.weeklyVolumeTarget;
    if (nextBand && level >= band.hiLevel - 1) {
      // Last 2 levels of the band ease toward the next band's value.
      const step = level === band.hiLevel ? 1 : 0.5;
      weeklyVolumeTarget = Math.round(band.weeklyVolumeTarget + (nextBand.weeklyVolumeTarget - band.weeklyVolumeTarget) * step * 0.5);
    }
    rows.push({ ...band, level, weeklyVolumeTarget });
  }
  return rows;
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

  const targets = CURVES.map((curve) => {
    const program = programs.find((p) => resolveToSlug(p.id) === curve.slug);
    const movementPattern = (DOMAIN_RESOLUTION_SKILL_PARENT_MAP as Record<string, string>)[curve.slug];
    return { curve, program, movementPattern };
  });

  const missingProgram = targets.filter((t) => !t.program);
  if (missingProgram.length > 0) {
    console.error('❌ Could not resolve a programs doc for:', missingProgram.map((t) => t.curve.slug).join(', '));
    process.exit(1);
  }

  console.log(`Resolved all ${targets.length} skill programs. movementPattern + 25-level volume curve for each:\n`);
  for (const { curve, program, movementPattern } of targets) {
    console.log(`${curve.slug} (${program!.id}, "${program!.name}") → movementPattern: ${movementPattern}, slowdownFactor: ${curve.slowdownFactor}`);
  }

  if (!isApply) {
    console.log('\n=== Full 25-level expansion (dry run) ===');
    for (const { curve, program } of targets) {
      console.log(`\n-- ${curve.slug} (${program!.id}) --`);
      const rows = expandToLevels(curve);
      for (const r of rows) {
        const baseGain = Math.round(r.baseGain * curve.slowdownFactor * 10) / 10;
        const firstSessionBonus = Math.round(r.firstSessionBonus * curve.slowdownFactor * 10) / 10;
        console.log(
          `  L${r.level}: weeklyVolumeTarget=${r.weeklyVolumeTarget} maxSets=${r.maxSets} ` +
          `minSets=${r.minSets ?? 'undefined'} baseGain=${baseGain} firstSessionBonus=${firstSessionBonus} ` +
          `maxIntenseWorkoutsPerWeek=${r.maxIntenseWorkoutsPerWeek}`,
        );
      }
    }
    console.log('\nDry run only (pass --apply to write). No Firestore writes made.');
    process.exit(0);
  }

  console.log('\n=== Pre-write snapshot (programs.movementPattern + existence of level docs) ===');
  for (const { curve, program } of targets) {
    const doc = await db.collection('programs').doc(program!.id).get();
    console.log(`  ${curve.slug}: movementPattern was ${JSON.stringify(doc.data()?.movementPattern ?? null)}`);
  }

  console.log('\n=== Writing ===');
  for (const { curve, program, movementPattern } of targets) {
    await db.collection('programs').doc(program!.id).update({ movementPattern });
    console.log(`  ✓ ${curve.slug}: movementPattern → ${movementPattern}`);

    const rows = expandToLevels(curve);
    for (const r of rows) {
      const docId = `${program!.id}_level_${r.level}`;
      const payload: Record<string, unknown> = {
        programId: program!.id,
        levelNumber: r.level,
        weeklyVolumeTarget: r.weeklyVolumeTarget,
        maxSets: r.maxSets,
        baseGain: Math.round(r.baseGain * curve.slowdownFactor * 10) / 10,
        firstSessionBonus: Math.round(r.firstSessionBonus * curve.slowdownFactor * 10) / 10,
        maxIntenseWorkoutsPerWeek: r.maxIntenseWorkoutsPerWeek,
      };
      if (r.minSets != null) payload.minSets = r.minSets;
      await db.collection('programLevelSettings').doc(docId).set(payload, { merge: true });
    }
    console.log(`  ✓ ${curve.slug}: 25 programLevelSettings docs written (merge:true -- existing fields on these docs, if any, are preserved)`);
  }

  console.log('\n=== Post-write verification (re-read from DB, not the value sent) ===');
  for (const { curve, program, movementPattern } of targets) {
    const progDoc = await db.collection('programs').doc(program!.id).get();
    const plsDoc = await db.collection('programLevelSettings').doc(`${program!.id}_level_14`).get();
    const okPattern = progDoc.data()?.movementPattern === movementPattern;
    console.log(
      `  ${okPattern ? '✅' : '❌'} ${curve.slug}: movementPattern=${progDoc.data()?.movementPattern} | ` +
      `L14 sample: weeklyVolumeTarget=${plsDoc.data()?.weeklyVolumeTarget} maxSets=${plsDoc.data()?.maxSets}`,
    );
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
