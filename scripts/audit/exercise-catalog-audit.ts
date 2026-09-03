/**
 * scripts/audit/exercise-catalog-audit.ts — READ ONLY. No writes, no migrations,
 * no value fixes. One-off data audit of the `exercises` Firestore collection.
 *
 * Grounded in docs/workout-engine/01-MAP.md §4 (exercise schema), §7 (filter
 * sites), §9 (core exercises) — field names and thresholds below are the real
 * ones from that map, cross-checked directly against source on 2026-09-02.
 *
 * ── Why RAW Firestore docs, not getAllExercises() ──────────────────────────
 * getAllExercises() (src/features/content/exercises/core/exercise.service.ts)
 * runs every doc through normalizeExercise(), which BACKFILLS several of the
 * exact fields this audit is measuring as missing — e.g. secondsPerRep
 * defaults to 3 for reps-type exercises, base_movement_id defaults to
 * 'unspecified_movement' (exercise-mapping.utils.ts, normalizeExercise body).
 * Running this audit against the normalized object would make those gaps
 * invisible. A data-quality audit needs to see what's actually stored, so
 * this script reads doc.data() directly via firebase-admin — matching the
 * established pattern of every other scripts/*.ts one-off audit in this repo
 * (see scripts/diag-park-method-gating.ts).
 *
 * ── Why some logic is imported and some is ported ──────────────────────────
 * Where a pure, Firebase-free production function exists, it is imported and
 * called directly — zero risk of drift from the real selection logic:
 *   - selectMethodForContext (shared/utils/method-selection.utils.ts) — the
 *     production execution-method cascade, used here to check whether an
 *     exercise has a *viable* method for a location, not just an authored
 *     one, with the same park-strict/bodyweight-fallback rules as generation.
 *   - normalizeGearId / isGearOptional / satisfiesGearRequirement /
 *     seedEquipmentCaches / ESSENTIAL_PARK_GEAR / ASSUMED_HOME_GEAR
 *     (shared/utils/gear-mapping.utils.ts) — the real gear-family resolution,
 *     seeded from live gear_definitions/gym_equipment docs (mirrors
 *     scripts/diag-park-method-gating.ts's precedent exactly).
 *
 * Where a check needs the exact canonical core-detection logic
 * (shadow-level.utils.ts:213-227, exerciseMatchesProgram) it is PORTED
 * inline verbatim (not imported) because that module's programId→slug
 * resolution (resolveToSlug) depends on a module-level cache populated from
 * live `programs` docs at request time. This script instead builds its own
 * id→slug map directly from the `programs` collection (replicating
 * buildIdToSlugMapFromPrograms's exact formula,
 * program-hierarchy.utils.ts:108-125: `slug = p.slug || p.movementPattern ||
 * name.toLowerCase().replace(/[\s-]+/g,'_')`), which is the same data the
 * production cache would have contained — this is a faithful port, not an
 * approximation with unflagged gaps.
 *
 * Run:  npx tsx scripts/audit/exercise-catalog-audit.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

import {
  normalizeGearId,
  isGearOptional,
  satisfiesGearRequirement,
  seedEquipmentCaches,
  ESSENTIAL_PARK_GEAR,
  ASSUMED_HOME_GEAR,
} from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { selectMethodForContext } from '@/features/workout-engine/shared/utils/method-selection.utils';

// ============================================================================
// SCHEMA CONSTANTS — copied verbatim from exercise.types.ts (§4 of the map doc)
// ============================================================================

// exercise.types.ts:394
const VALID_LOCATIONS = new Set([
  'home', 'park', 'street', 'office', 'school', 'gym', 'airport', 'library', 'desk', 'service',
]);
// exercise.types.ts:248-257
const VALID_MOVEMENT_GROUPS = new Set([
  'squat', 'hinge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull',
  'core', 'isolation', 'flexibility',
]);
// exercise.types.ts:176-198
const VALID_MUSCLE_GROUPS = new Set([
  'chest', 'back', 'middle_back', 'shoulders', 'rear_delt', 'abs', 'obliques', 'forearms',
  'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'traps', 'cardio',
  'full_body', 'core', 'legs', 'serratus', 'adductors', 'hip_flexors',
]);
// exercise.types.ts:164
const VALID_MECHANICAL_TYPES = new Set(['straight_arm', 'bent_arm', 'hybrid', 'none']);

// Thresholds cited by the task — verified against current source this session:
const CLIFF_TOLERANCE_MIN_COUNT = 4;  // InputSanitizerMiddleware.ts:457 (`levelMatched.length >= 4`)
const THIN_MIN_HEALTHY_POOL = 6;      // PoolFactory.ts MIN_HEALTHY_POOL
const LEVEL_TOLERANCE = 3;            // the ±3 window both thresholds are evaluated against

const OUT_DIR = path.join(__dirname, '..', '..', 'docs', 'workout-engine');
const MD_PATH = path.join(OUT_DIR, '02-CATALOG-AUDIT.md');
const GAPS_CSV_PATH = path.join(OUT_DIR, '02-catalog-gaps.csv');
const MATRIX_CSV_PATH = path.join(OUT_DIR, '02-coverage-matrix.csv');

// ============================================================================
// SMALL HELPERS
// ============================================================================

function csvEscape(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows: string[][]): string {
  return rows.map(r => r.map(csvEscape).join(',')).join('\n') + '\n';
}
function getName(ex: any): string {
  const n = ex?.name;
  if (!n) return '(no name)';
  if (typeof n === 'string') return n;
  const lang = ex?.lang;
  return n[lang] || n.he || n.en || n.es || '(no name)';
}
function isMissing(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// ============================================================================
// PHASE 0 — Firebase init + raw collection reads
// ============================================================================

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c as any), projectId: c.project_id });
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  console.log('Reading exercises / gear_definitions / gym_equipment / programs …');
  const [exSnap, gearSnap, gymSnap, progSnap] = await Promise.all([
    db.collection('exercises').get(),
    db.collection('gear_definitions').get(),
    db.collection('gym_equipment').get(),
    db.collection('programs').get(),
  ]);

  const exercises = exSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const gearDefs = gearSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const gymEquip = gymSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const programs = progSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  // Seed the REAL gear caches so normalizeGearId/isGearOptional/
  // satisfiesGearRequirement resolve Firestore IDs exactly like the engine
  // does at runtime (precedent: scripts/diag-park-method-gating.ts).
  seedEquipmentCaches(gearDefs as any, gymEquip as any);

  // id→slug map — faithful port of buildIdToSlugMapFromPrograms's formula
  // (program-hierarchy.utils.ts:108-125), built from the SAME live programs
  // docs the production cache would use.
  const idToSlug = new Map<string, string>();
  for (const p of programs) {
    const slug = p.slug || p.movementPattern ||
      (typeof p.name === 'string' ? p.name : (p.name?.he ?? p.id)).toLowerCase().replace(/[\s-]+/g, '_');
    idToSlug.set(p.id, slug);
  }
  const resolveSlug = (programId: string): string => idToSlug.get(programId) ?? programId;

  console.log(`${exercises.length} exercises, ${gearDefs.length} gear_definitions, ${gymEquip.length} gym_equipment, ${programs.length} programs.\n`);

  const report = runAudit(exercises, resolveSlug);
  writeOutputs(report);
  console.log(`\nWrote:\n  ${MD_PATH}\n  ${GAPS_CSV_PATH}\n  ${MATRIX_CSV_PATH}`);
  process.exit(0);
}

// ============================================================================
// PHASE 1 — Core detectors (canonical vs. partial), ported inline
// ============================================================================

/**
 * Faithful inline port of exerciseMatchesProgram(ex, 'core')
 * (shadow-level.utils.ts:213-227) — the canonical core detector cited by the
 * map doc §9 as the source of truth. `resolveToSlug` calls are satisfied by
 * this script's own `resolveSlug`, built from the same live `programs` data
 * the production cache uses (see PHASE 0) — not an approximation.
 */
function isCoreCanonical(ex: any, resolveSlug: (id: string) => string): { result: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (ex.movementGroup === 'core') reasons.push('movementGroup=core');
  const pm = ex.primaryMuscle;
  if (pm && ['abs', 'core', 'obliques'].includes(pm)) reasons.push(`primaryMuscle=${pm}`);
  if (Array.isArray(ex.programIds) && ex.programIds.includes('core')) reasons.push('programIds includes "core"');
  if (Array.isArray(ex.targetPrograms) && ex.targetPrograms.some((tp: any) =>
    tp.programId === 'core' || resolveSlug(tp.programId) === 'core')) {
    reasons.push('targetPrograms resolves to "core"');
  }
  const nameStr = getName(ex).toLowerCase();
  const tagsStr = (Array.isArray(ex.tags) ? ex.tags.join(' ') : '').toLowerCase();
  const combined = `${nameStr} ${tagsStr}`;
  const stringHit = ['core', 'plank', 'abs', 'בטן', 'פלאנק'].find(s => combined.includes(s.toLowerCase()));
  if (stringHit) reasons.push(`name/tags string match ("${stringHit}")`);
  return { result: reasons.length > 0, reasons };
}

/**
 * Faithful inline port of the PARTIAL core detector in
 * trio-modifiers.service.ts:243-246 (`applyIntenseOption`'s `isCore`) —
 * verbatim: `mg === 'core' || pm === 'core' || pm === 'abs'`.
 * Note it does NOT check 'obliques', unlike the canonical detector above —
 * that omission is exactly the drift item 5 of the task asks to surface.
 */
function isCoreTrioDetector(ex: any): boolean {
  return ex.movementGroup === 'core' || ex.primaryMuscle === 'core' || ex.primaryMuscle === 'abs';
}

// ============================================================================
// PHASE 2 — programId × level pairs per exercise (for the coverage matrix)
// ============================================================================

/**
 * Level fallback for exercises with empty targetPrograms — verbatim from
 * resolveExerciseLevelForDomains (workout-selection.utils.ts:95-97):
 *   `return { level: exercise.recommendedLevel || 1, resolvedDomain: null }`
 * i.e. NOT flatly 1 — the deprecated recommendedLevel wins if populated.
 */
function fallbackLevel(ex: any): number {
  return (typeof ex.recommendedLevel === 'number' && ex.recommendedLevel > 0) ? ex.recommendedLevel : 1;
}

/**
 * Returns the (programId, level) pairs this exercise contributes to the
 * program-level system, mirroring how it will actually be leveled:
 *   - non-empty targetPrograms → one pair per entry, exact level
 *   - empty targetPrograms but non-empty legacy programIds → one pair per
 *     legacy programId, at fallbackLevel(ex) — this is how
 *     resolveExerciseLevelForDomains would level it if it were ever matched
 *     via the programIds membership path (InputSanitizerMiddleware.ts:
 *     "if (ex.programIds?.length) { return ex.programIds.some(pid => ...) }"
 *     — that branch bypasses the ±3 pre-filter check entirely on level, but
 *     ContextualEngine's gate #2 still assigns it fallbackLevel(ex))
 *   - neither → exercise contributes nothing (counted separately as "orphaned")
 */
function programLevelPairs(ex: any, resolveSlug: (id: string) => string): Array<{ programId: string; level: number }> {
  if (Array.isArray(ex.targetPrograms) && ex.targetPrograms.length > 0) {
    return ex.targetPrograms
      .filter((tp: any) => tp && typeof tp.programId === 'string' && typeof tp.level === 'number')
      .map((tp: any) => ({ programId: resolveSlug(tp.programId), level: tp.level }));
  }
  if (Array.isArray(ex.programIds) && ex.programIds.length > 0) {
    const lvl = fallbackLevel(ex);
    return ex.programIds.map((pid: string) => ({ programId: resolveSlug(pid), level: lvl }));
  }
  return [];
}

// ============================================================================
// PHASE 3 — location viability, via the REAL production selector
// ============================================================================

// InputSanitizerMiddleware.normalizeEquipmentArray baseline injections
// (gear-mapping.utils.ts: ESSENTIAL_PARK_GEAR / ASSUMED_HOME_GEAR;
// ASSUMED_HOME_GEAR_ENABLED default = true, config/feature-flags.ts:135).
function baselineGearFor(location: string): string[] {
  if (location === 'park') return Array.from(ESSENTIAL_PARK_GEAR);
  if (location === 'home' || location === 'office' || location === 'school') return Array.from(ASSUMED_HOME_GEAR);
  return []; // street/gym/airport/library/desk/service — no baseline assumed
}

/** True iff selectMethodForContext (the REAL production selector) finds a
 *  viable method for this exercise at this location with baseline gear. */
function hasViableMethod(ex: any, location: string): boolean {
  const methods = ex.execution_methods || ex.executionMethods || [];
  if (!methods.length) return false;
  return selectMethodForContext(ex, location as any, baselineGearFor(location)) !== null;
}

// ============================================================================
// AUDIT LOGIC
// ============================================================================

interface GapRow {
  exercise_id: string;
  name: string;
  lang: string;
  missing_fields: string[];
  suspicious_values: string[];
  is_core_by_canonical: boolean;
  is_core_by_trio_detector: boolean;
}

function runAudit(exercises: any[], resolveSlug: (id: string) => string) {
  const total = exercises.length;

  // ── §1 totals ──────────────────────────────────────────────────────────
  const byLang = new Map<string, number>();
  const bySupportedLangsSignature = new Map<string, number>();
  for (const ex of exercises) {
    const lang = typeof ex.lang === 'string' ? ex.lang : '(missing — defaults to he)';
    byLang.set(lang, (byLang.get(lang) ?? 0) + 1);
    const sig = Array.isArray(ex.supportedLangs) && ex.supportedLangs.length
      ? [...ex.supportedLangs].sort().join('+')
      : '(empty — he-only)';
    bySupportedLangsSignature.set(sig, (bySupportedLangsSignature.get(sig) ?? 0) + 1);
  }

  // ── §2 missing critical fields ────────────────────────────────────────
  const CRITICAL_FIELDS = [
    'targetPrograms', 'movementGroup', 'primaryMuscle', 'execution_methods',
    'mechanicalType', 'injuryShield', 'noiseLevel', 'sweatLevel', 'symmetry', 'secondsPerRep',
  ] as const;
  const missingCounts = new Map<string, number>(CRITICAL_FIELDS.map(f => [f, 0]));
  let orphanedFromProgramSystem = 0; // neither targetPrograms nor programIds

  // ── §5/§6 accumulators ────────────────────────────────────────────────
  const gapRows: GapRow[] = [];
  const coreCanonicalRows: Array<{ ex: any; reasons: string[]; trioDetector: boolean; level: number | null }> = [];
  const driftRows: Array<{ ex: any; reasons: string[] }> = [];
  const baseMovementGroups = new Map<string, any[]>();
  const nameLangGroups = new Map<string, any[]>();

  // ── coverage-matrix accumulators ─────────────────────────────────────
  // key = `${programId}::${level}` → exercise list
  const programLevelPool = new Map<string, any[]>();
  const observedProgramIds = new Set<string>();
  const observedLocations = new Set<string>();
  let maxLevelPerProgram = new Map<string, number>();

  // ── location × movementGroup accumulators ────────────────────────────
  const mgLocationTotal = new Map<string, number>();   // `${location}::${mg}` → total exercises with that mg
  const mgLocationViable = new Map<string, number>();  // same key → viable-method count

  const parkHardRejected: any[] = [];

  for (const ex of exercises) {
    // --- §2 missing fields ---
    const missing: string[] = [];
    const methods = ex.execution_methods || ex.executionMethods || [];
    if (isMissing(ex.targetPrograms)) { missing.push('targetPrograms'); missingCounts.set('targetPrograms', missingCounts.get('targetPrograms')! + 1); }
    if (isMissing(ex.movementGroup)) { missing.push('movementGroup'); missingCounts.set('movementGroup', missingCounts.get('movementGroup')! + 1); }
    if (isMissing(ex.primaryMuscle)) { missing.push('primaryMuscle'); missingCounts.set('primaryMuscle', missingCounts.get('primaryMuscle')! + 1); }
    if (methods.length === 0) { missing.push('execution_methods'); missingCounts.set('execution_methods', missingCounts.get('execution_methods')! + 1); }
    if (isMissing(ex.mechanicalType)) { missing.push('mechanicalType'); missingCounts.set('mechanicalType', missingCounts.get('mechanicalType')! + 1); }
    if (isMissing(ex.injuryShield)) { missing.push('injuryShield'); missingCounts.set('injuryShield', missingCounts.get('injuryShield')! + 1); }
    if (isMissing(ex.noiseLevel)) { missing.push('noiseLevel'); missingCounts.set('noiseLevel', missingCounts.get('noiseLevel')! + 1); }
    if (isMissing(ex.sweatLevel)) { missing.push('sweatLevel'); missingCounts.set('sweatLevel', missingCounts.get('sweatLevel')! + 1); }
    if (isMissing(ex.symmetry)) { missing.push('symmetry'); missingCounts.set('symmetry', missingCounts.get('symmetry')! + 1); }
    if (isMissing(ex.secondsPerRep)) { missing.push('secondsPerRep'); missingCounts.set('secondsPerRep', missingCounts.get('secondsPerRep')! + 1); }

    const hasTargetPrograms = Array.isArray(ex.targetPrograms) && ex.targetPrograms.length > 0;
    const hasProgramIds = Array.isArray(ex.programIds) && ex.programIds.length > 0;
    if (!hasTargetPrograms && !hasProgramIds) orphanedFromProgramSystem++;

    // --- §6 invalid enum values ---
    const suspicious: string[] = [];
    if (ex.movementGroup && !VALID_MOVEMENT_GROUPS.has(ex.movementGroup)) {
      suspicious.push(`invalid movementGroup: "${ex.movementGroup}"`);
    }
    if (ex.primaryMuscle && !VALID_MUSCLE_GROUPS.has(ex.primaryMuscle)) {
      suspicious.push(`invalid primaryMuscle: "${ex.primaryMuscle}"`);
    }
    if (ex.mechanicalType && !VALID_MECHANICAL_TYPES.has(ex.mechanicalType)) {
      suspicious.push(`invalid mechanicalType: "${ex.mechanicalType}"`);
    }
    for (const m of methods) {
      if (m?.location && !VALID_LOCATIONS.has(m.location)) {
        suspicious.push(`invalid execution_method.location: "${m.location}"`);
      }
      if (Array.isArray(m?.locationMapping)) {
        for (const lm of m.locationMapping) {
          if (!VALID_LOCATIONS.has(lm)) suspicious.push(`invalid locationMapping entry: "${lm}"`);
        }
      }
    }

    // --- §5 core detectors ---
    const canonical = isCoreCanonical(ex, resolveSlug);
    const trioDetector = isCoreTrioDetector(ex);
    if (canonical.result) {
      const coreEntry = Array.isArray(ex.targetPrograms) ? ex.targetPrograms.find((tp: any) => tp.programId === 'core' || resolveSlug(tp.programId) === 'core') : undefined;
      coreCanonicalRows.push({ ex, reasons: canonical.reasons, trioDetector, level: coreEntry ? coreEntry.level : null });
      if (!trioDetector) driftRows.push({ ex, reasons: canonical.reasons });
    }

    // --- §6 duplicate base_movement_id (RAW field only — no fallback substitution) ---
    if (typeof ex.base_movement_id === 'string' && ex.base_movement_id.trim().length > 0) {
      const key = ex.base_movement_id.trim();
      if (!baseMovementGroups.has(key)) baseMovementGroups.set(key, []);
      baseMovementGroups.get(key)!.push(ex);
    }

    // --- §6 duplicate name+lang ---
    const nameKey = getName(ex).trim().toLowerCase();
    const langKey = typeof ex.lang === 'string' ? ex.lang : 'he';
    if (nameKey && nameKey !== '(no name)') {
      const key = `${nameKey}::${langKey}`;
      if (!nameLangGroups.has(key)) nameLangGroups.set(key, []);
      nameLangGroups.get(key)!.push(ex);
    }

    if (missing.length > 0 || suspicious.length > 0) {
      gapRows.push({
        exercise_id: ex.id,
        name: getName(ex),
        lang: langKey,
        missing_fields: missing,
        suspicious_values: suspicious,
        is_core_by_canonical: canonical.result,
        is_core_by_trio_detector: trioDetector,
      });
    }

    // --- coverage matrix: programId × level pool ---
    for (const { programId, level } of programLevelPairs(ex, resolveSlug)) {
      observedProgramIds.add(programId);
      const key = `${programId}::${level}`;
      if (!programLevelPool.has(key)) programLevelPool.set(key, []);
      programLevelPool.get(key)!.push(ex);
      maxLevelPerProgram.set(programId, Math.max(maxLevelPerProgram.get(programId) ?? 0, level));
    }

    // --- location viability (for §3's location dimension AND §4) ---
    const exLocations = new Set<string>();
    for (const m of methods) {
      if (m?.location && VALID_LOCATIONS.has(m.location)) exLocations.add(m.location);
      if (Array.isArray(m?.locationMapping)) for (const lm of m.locationMapping) if (VALID_LOCATIONS.has(lm)) exLocations.add(lm);
    }
    for (const loc of exLocations) observedLocations.add(loc);
    // §4 (location × movementGroup) needs the FULL observedLocations set
    // before it can be computed — done in the second pass below.
  }

  // Second pass for §4 (needs the FULL observedLocations set first) and for
  // hasViableMethod checks (also §3's per-cell location coverage).
  for (const ex of exercises) {
    const mg = ex.movementGroup || '(none)';
    for (const loc of observedLocations) {
      const totalKey = `${loc}::${mg}`;
      mgLocationTotal.set(totalKey, (mgLocationTotal.get(totalKey) ?? 0) + 1);
      if (hasViableMethod(ex, loc)) {
        mgLocationViable.set(totalKey, (mgLocationViable.get(totalKey) ?? 0) + 1);
      }
    }

    // §4 park-specific hard-rejection detector (method-selection.utils.ts:154-166)
    const methods = ex.execution_methods || ex.executionMethods || [];
    const parkTagged = methods.some((m: any) => m?.location === 'park' || m?.locationMapping?.includes('park'));
    if (parkTagged && !hasViableMethod(ex, 'park')) {
      parkHardRejected.push(ex);
    }
  }

  // ── build the programId × level × location coverage matrix ────────────
  const matrixRows: Array<{
    programId: string; level: number; location: string;
    exercise_count: number; count_within_tolerance_3: number; flag: 'CLIFF' | 'THIN' | 'OK';
  }> = [];

  const programIds = Array.from(observedProgramIds).sort();
  const locations = Array.from(observedLocations).sort();

  for (const programId of programIds) {
    const maxLevel = maxLevelPerProgram.get(programId) ?? 1;
    for (let level = 1; level <= maxLevel; level++) {
      // exact-level pool (location-agnostic) — reused per location below
      const exactPool = programLevelPool.get(`${programId}::${level}`) ?? [];
      // ±3 tolerance pool (location-agnostic)
      let tolerancePool: any[] = [];
      for (let l = level - LEVEL_TOLERANCE; l <= level + LEVEL_TOLERANCE; l++) {
        tolerancePool.push(...(programLevelPool.get(`${programId}::${l}`) ?? []));
      }
      for (const location of locations) {
        const exactAtLocation = exactPool.filter(ex => hasViableMethod(ex, location));
        const toleranceAtLocation = tolerancePool.filter(ex => hasViableMethod(ex, location));
        const count = toleranceAtLocation.length;
        const flag: 'CLIFF' | 'THIN' | 'OK' =
          count < CLIFF_TOLERANCE_MIN_COUNT ? 'CLIFF' : count < THIN_MIN_HEALTHY_POOL ? 'THIN' : 'OK';
        matrixRows.push({
          programId, level, location,
          exercise_count: exactAtLocation.length,
          count_within_tolerance_3: count,
          flag,
        });
      }
    }
  }

  return {
    total, byLang, bySupportedLangsSignature,
    CRITICAL_FIELDS, missingCounts, orphanedFromProgramSystem,
    gapRows, coreCanonicalRows, driftRows,
    baseMovementGroups, nameLangGroups,
    matrixRows, programIds, locations,
    mgLocationTotal, mgLocationViable,
    parkHardRejected,
  };
}

// ============================================================================
// OUTPUT WRITERS
// ============================================================================

function writeOutputs(r: ReturnType<typeof runAudit>) {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── 02-catalog-gaps.csv ────────────────────────────────────────────────
  const gapCsvRows: string[][] = [
    ['exercise_id', 'name', 'lang', 'missing_fields', 'suspicious_values', 'is_core_by_canonical', 'is_core_by_trio_detector'],
  ];
  for (const g of r.gapRows) {
    gapCsvRows.push([
      g.exercise_id, g.name, g.lang,
      g.missing_fields.join('; '), g.suspicious_values.join('; '),
      String(g.is_core_by_canonical), String(g.is_core_by_trio_detector),
    ]);
  }
  fs.writeFileSync(GAPS_CSV_PATH, toCsv(gapCsvRows), 'utf-8');

  // ── 02-coverage-matrix.csv ─────────────────────────────────────────────
  const matrixCsvRows: string[][] = [
    ['programId', 'level', 'location', 'exercise_count', 'count_within_tolerance_3', 'flag'],
  ];
  for (const m of r.matrixRows) {
    matrixCsvRows.push([m.programId, String(m.level), m.location, String(m.exercise_count), String(m.count_within_tolerance_3), m.flag]);
  }
  fs.writeFileSync(MATRIX_CSV_PATH, toCsv(matrixCsvRows), 'utf-8');

  // ── 02-CATALOG-AUDIT.md ────────────────────────────────────────────────
  const md = buildMarkdownReport(r);
  fs.writeFileSync(MD_PATH, md, 'utf-8');
}

function pct(n: number, total: number): string {
  return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '—';
}

function buildMarkdownReport(r: ReturnType<typeof runAudit>): string {
  const lines: string[] = [];
  const push = (s: string = '') => lines.push(s);

  push('# Exercise Catalog — Data Audit');
  push();
  push('> **Status:** read-only data audit. No Firestore writes, no migrations, no value fixes.');
  push('> Produced by `scripts/audit/exercise-catalog-audit.ts` — run again after any content');
  push('> change to get a fresh snapshot; this file is a point-in-time report, not live.');
  push('> Grounded in [`01-MAP.md`](01-MAP.md) §4 (schema), §7 (filter sites), §9 (core).');
  push();
  push('## Methodology & simplifications (read before the numbers)');
  push();
  push('- **Raw Firestore data, not `getAllExercises()`.** That function runs every doc through');
  push('  `normalizeExercise()`, which backfills several of the exact fields this audit measures');
  push('  as missing (e.g. `secondsPerRep` defaults to 3, `base_movement_id` defaults to');
  push('  `\'unspecified_movement\'`). Reading raw `doc.data()` shows what is actually stored.');
  push('- **"Missing" for array fields** (`targetPrograms`, `execution_methods`, `injuryShield`)');
  push('  means the field is absent, `null`, or an empty array — consistent with how the task');
  push('  framed `execution_methods` ("ריק לגמרי ⇒ לעולם לא ייבחר"), applied uniformly.');
  push('- **CLIFF/THIN/OK** use `count_within_tolerance_3` (exercises within ±3 levels of the row\'s');
  push(`  level, for that programId, with a viable method at that location) — not the exact-level`);
  push('  count — because that is what the two real production thresholds actually gate on:');
  push('  `CLIFF` mirrors `InputSanitizerMiddleware.ts:457` (`levelMatched.length >= 4` else the');
  push('  whole level filter is abandoned); `THIN` mirrors `PoolFactory.ts`\'s `MIN_HEALTHY_POOL = 6`');
  push('  (below this, `PoolRescue` widens tolerance to ±5). **Simplification flagged explicitly:**');
  push('  in production, the `CLIFF` check (`InputSanitizerMiddleware`) runs *before* location');
  push('  filtering and is location-agnostic, while `THIN` (`PoolFactory`) runs *after*');
  push('  `ContextualEngine`, which does apply location. This report evaluates both thresholds');
  push('  per-location for uniform, actionable granularity — read a CLIFF cell as "would be a');
  push('  catastrophic pre-filter abandon if this were the only location-relevant slice," not as');
  push('  a literal reproduction of the location-agnostic pre-filter step.');
  push('- **Location viability** uses the real production selector `selectMethodForContext`');
  push('  (`shared/utils/method-selection.utils.ts`), called directly — not reimplemented — with a');
  push('  baseline gear set per location: `ESSENTIAL_PARK_GEAR` for park, `ASSUMED_HOME_GEAR` for');
  push('  home/office/school (matching the default-on `ASSUMED_HOME_GEAR_ENABLED` flag), and no');
  push('  baseline gear (bodyweight-only) for street/gym/airport/library/desk/service. A real');
  push('  user\'s actual gear/park inventory will do better than this baseline in many cases — these');
  push('  numbers are a conservative floor, not a promise of what any specific user sees.');
  push('- **Core detector (§5)** is a verbatim inline port of the canonical');
  push('  `exerciseMatchesProgram(ex, \'core\')` (`shadow-level.utils.ts:213-227`). Its');
  push('  `resolveToSlug` calls are satisfied by this script\'s own id→slug map, built directly from');
  push('  live `programs` docs using the exact same formula as production\'s');
  push('  `buildIdToSlugMapFromPrograms` (`program-hierarchy.utils.ts:108-125`) — not an');
  push('  approximation.');
  push('- **`programId`s in the coverage matrix (§3)** are only those actually found in the catalog\'s');
  push('  `targetPrograms`/`programIds` fields (resolved through the id→slug map above) — nothing');
  push('  hardcoded from truth docs.');
  push('- Nothing below was fixed. This is a map of the problem, not a remediation.');
  push();
  push('---');
  push();

  // §1
  push('## 1. Totals');
  push();
  push(`**Total exercises: ${r.total}**`);
  push();
  push('### By `lang`');
  push();
  push('| lang | count | % |');
  push('|---|---|---|');
  for (const [k, v] of Array.from(r.byLang.entries()).sort((a, b) => b[1] - a[1])) {
    push(`| ${k} | ${v} | ${pct(v, r.total)} |`);
  }
  push();
  push('### By `supportedLangs`');
  push();
  push('| supportedLangs | count | % |');
  push('|---|---|---|');
  for (const [k, v] of Array.from(r.bySupportedLangsSignature.entries()).sort((a, b) => b[1] - a[1])) {
    push(`| ${k} | ${v} | ${pct(v, r.total)} |`);
  }
  push();
  push('---');
  push();

  // §2
  push('## 2. Missing critical fields');
  push();
  push('| Field | Missing count | % of catalog | Note |');
  push('|---|---|---|---|');
  const fieldNotes: Record<string, string> = {
    targetPrograms: '⚠️ empty ⇒ falls back to `recommendedLevel || 1` at read time (`workout-selection.utils.ts:95-97`), NOT a flat 1 — see the breakdown below',
    movementGroup: 'used for Smart Swap family + core/legs detection',
    primaryMuscle: 'used for core/legs detection, hold-time tier',
    execution_methods: '🔴 completely empty ⇒ this exercise can NEVER be selected (no viable method exists)',
    mechanicalType: 'used for SA/BA balance scoring',
    injuryShield: 'used for injury-shield hard exclusion — empty may be a legitimate "no risk" state, not necessarily a gap',
    noiseLevel: 'used for noise-limit hard exclusion',
    sweatLevel: 'used for sweat-limit hard exclusion',
    symmetry: 'unilateral doubles duration estimate — missing skews time budgeting',
    secondsPerRep: 'defaults to 3 at generation time via a DIFFERENT code path (`normalizeExercise`) — this row shows the raw-data gap, not the runtime behavior',
  };
  for (const f of r.CRITICAL_FIELDS) {
    const n = r.missingCounts.get(f)!;
    push(`| \`${f}\` | ${n} | ${pct(n, r.total)} | ${fieldNotes[f]} |`);
  }
  push();
  push(`**Exercises with NEITHER \`targetPrograms\` NOR legacy \`programIds\`: ${r.orphanedFromProgramSystem}`
    + ` (${pct(r.orphanedFromProgramSystem, r.total)})** — these are invisible to the entire`);
  push('program-level system: they contribute to no cell in the §3 coverage matrix and can only');
  push('ever be selected via non-program-based paths (warmup/cooldown role, recovery pool, tag-only');
  push('pools like `hiit_friendly` for Tabata — see `01-MAP.md` §7.9).');
  push();
  push('---');
  push();

  // §3
  push('## 3. Coverage Matrix — programId × level × location');
  push();
  push(`Full matrix (${r.matrixRows.length} rows) is in [\`02-coverage-matrix.csv\`](02-coverage-matrix.csv).`);
  push(`Programs found in the catalog: ${r.programIds.join(', ') || '(none)'}.`);
  push(`Locations found in the catalog: ${r.locations.join(', ') || '(none)'}.`);
  push();
  const cliffRows = r.matrixRows.filter(m => m.flag === 'CLIFF').sort((a, b) => a.level - b.level || a.programId.localeCompare(b.programId) || a.location.localeCompare(b.location));
  const thinRows = r.matrixRows.filter(m => m.flag === 'THIN').sort((a, b) => a.level - b.level || a.programId.localeCompare(b.programId) || a.location.localeCompare(b.location));
  const okCount = r.matrixRows.length - cliffRows.length - thinRows.length;
  push(`**${cliffRows.length} CLIFF cells, ${thinRows.length} THIN cells, ${okCount} OK cells** (of ${r.matrixRows.length} total).`);
  push();
  push('Sorted ascending by level (low-to-mid levels affect the most users first).');
  push();
  push('### CLIFF cells (< 4 exercises within ±3 levels, at that location)');
  push();
  if (cliffRows.length === 0) {
    push('_None found._');
  } else {
    push('| programId | level | location | count_within_tolerance_3 | exact-level count |');
    push('|---|---|---|---|---|');
    for (const m of cliffRows) {
      push(`| ${m.programId} | ${m.level} | ${m.location} | ${m.count_within_tolerance_3} | ${m.exercise_count} |`);
    }
  }
  push();
  push('### THIN cells (4–5 exercises within ±3 levels, at that location)');
  push();
  if (thinRows.length === 0) {
    push('_None found._');
  } else {
    push('| programId | level | location | count_within_tolerance_3 | exact-level count |');
    push('|---|---|---|---|---|');
    for (const m of thinRows) {
      push(`| ${m.programId} | ${m.level} | ${m.location} | ${m.count_within_tolerance_3} | ${m.exercise_count} |`);
    }
  }
  push();
  push('---');
  push();

  // §4
  push('## 4. Coverage Matrix — location × movementGroup');
  push();
  push('For each (location, movementGroup) pair: total exercises with that movementGroup, and how');
  push('many have a viable `execution_method` at that location (via the real `selectMethodForContext`');
  push('selector, baseline gear per the methodology note above).');
  push();
  push('| location | movementGroup | total exercises | viable at location | % viable |');
  push('|---|---|---|---|---|');
  const mgKeys = Array.from(r.mgLocationTotal.keys()).sort();
  for (const key of mgKeys) {
    const [loc, mg] = key.split('::');
    const total = r.mgLocationTotal.get(key)!;
    const viable = r.mgLocationViable.get(key) ?? 0;
    push(`| ${loc} | ${mg} | ${total} | ${viable} | ${pct(viable, total)} |`);
  }
  push();
  push(`### Park-specific hard rejections (method-selection.utils.ts:154-166)`);
  push();
  push(`**${r.parkHardRejected.length} exercise(s)** are tagged \`location='park'\` (or \`locationMapping\``);
  push('includes `park`) but their park-tagged method(s) all fail equipment gating against');
  push('`ESSENTIAL_PARK_GEAR`, AND no bodyweight/surface method exists either — these are hard-');
  push('rejected (`selectMethodForContext` returns `null`) and dropped from the pool entirely at a');
  push('baseline park, regardless of the exercise\'s content otherwise being ready.');
  push();
  if (r.parkHardRejected.length === 0) {
    push('_None found._');
  } else {
    push('| exercise_id | name |');
    push('|---|---|');
    for (const ex of r.parkHardRejected) {
      push(`| ${ex.id} | ${getName(ex)} |`);
    }
  }
  push();
  push('---');
  push();

  // §5
  push('## 5. Core Exercises');
  push();
  push(`**${r.coreCanonicalRows.length} exercises** identified as core by the canonical detector`);
  push('(`exerciseMatchesProgram(ex, \'core\')`, `shadow-level.utils.ts:213-227`).');
  push();
  push('| exercise_id | name | has targetPrograms[core] level? | movementGroup | primaryMuscle | matched via |');
  push('|---|---|---|---|---|---|');
  for (const row of r.coreCanonicalRows.slice(0, 500)) {
    const ex = row.ex;
    push(`| ${ex.id} | ${getName(ex)} | ${row.level ?? '**missing**'} | ${ex.movementGroup ?? '—'} | ${ex.primaryMuscle ?? '—'} | ${row.reasons.join(', ')} |`);
  }
  if (r.coreCanonicalRows.length > 500) {
    push(`\n_(showing first 500 of ${r.coreCanonicalRows.length} — full list not paginated further; re-run with a filter if needed)_`);
  }
  const missingCoreLevel = r.coreCanonicalRows.filter(row => row.level === null).length;
  push();
  push(`**${missingCoreLevel} of ${r.coreCanonicalRows.length} canonical-core exercises have no`);
  push('`targetPrograms` entry with `programId=\'core\'`** — i.e. they are recognized as core by');
  push('`movementGroup`/`primaryMuscle`/name-string only, with no explicit core level, so they fall');
  push('back to `recommendedLevel || 1` wherever a core level is needed (see §2).');
  push();
  push(`### Drift: canonical-core but NOT trio-detector-core (${r.driftRows.length} exercises)`);
  push();
  push('These are exercises `exerciseMatchesProgram` classifies as core, but the partial detector in');
  push('`trio-modifiers.service.ts:243-246` (`mg===\'core\' || pm===\'core\' || pm===\'abs\'`, which omits');
  push('`\'obliques\'` and never checks `programIds`/`targetPrograms`/name-strings) does not catch —');
  push('meaning the "Intense" trio option\'s core cap (`MAX_CORE=1`, `01-MAP.md` §9.B8) silently');
  push('undercounts these as non-core.');
  push();
  if (r.driftRows.length === 0) {
    push('_None found._');
  } else {
    push('| exercise_id | name | movementGroup | primaryMuscle | matched canonical via |');
    push('|---|---|---|---|---|');
    for (const row of r.driftRows) {
      const ex = row.ex;
      push(`| ${ex.id} | ${getName(ex)} | ${ex.movementGroup ?? '—'} | ${ex.primaryMuscle ?? '—'} | ${row.reasons.join(', ')} |`);
    }
  }
  push();
  push('---');
  push();

  // §6
  push('## 6. Invalid Values, Typos, Duplicates');
  push();
  const invalidRows = r.gapRows.filter(g => g.suspicious_values.length > 0);
  push(`### Invalid enum values (${invalidRows.length} exercises affected)`);
  push();
  push('Any raw value in an enum-constrained field (`execution_methods[].location`, `movementGroup`,');
  push('`primaryMuscle`, `mechanicalType`) not in the real TypeScript union — this also catches typos');
  push('automatically, since a typo will not match a valid enum value.');
  push();
  if (invalidRows.length === 0) {
    push('_None found._');
  } else {
    push('| exercise_id | name | invalid values |');
    push('|---|---|---|');
    for (const g of invalidRows) {
      push(`| ${g.exercise_id} | ${g.name} | ${g.suspicious_values.join('; ')} |`);
    }
  }
  push();
  const dupBaseMovement = Array.from(r.baseMovementGroups.entries()).filter(([, exs]) => exs.length > 1).sort((a, b) => b[1].length - a[1].length);
  push(`### Duplicate \`base_movement_id\` (${dupBaseMovement.length} groups shared by >1 exercise)`);
  push();
  push('**Not inherently a defect** — `base_movement_id` is designed to group exercise variants (e.g.');
  push('all pull-up variations) and HE/EN document pairs, per its own field comment');
  push('(`exercise.types.ts`: "grouping exercise variations"). Shown for visibility, sorted by group');
  push('size descending — an unusually large group is worth a manual look, a group of 2 (one HE + one');
  push('EN doc for the same movement) is expected.');
  push();
  if (dupBaseMovement.length === 0) {
    push('_None found._');
  } else {
    push('| base_movement_id | count | exercise names |');
    push('|---|---|---|');
    for (const [key, exs] of dupBaseMovement.slice(0, 200)) {
      push(`| ${key} | ${exs.length} | ${exs.map(getName).join('; ')} |`);
    }
    if (dupBaseMovement.length > 200) push(`\n_(showing first 200 of ${dupBaseMovement.length} groups)_`);
  }
  push();
  const dupNameLang = Array.from(r.nameLangGroups.entries()).filter(([, exs]) => exs.length > 1).sort((a, b) => b[1].length - a[1].length);
  push(`### Same name + lang (${dupNameLang.length} groups) — potential accidental duplicates`);
  push();
  if (dupNameLang.length === 0) {
    push('_None found._');
  } else {
    push('| name | lang | count | exercise_ids |');
    push('|---|---|---|---|');
    for (const [key, exs] of dupNameLang.slice(0, 200)) {
      const [name, lang] = key.split('::');
      push(`| ${name} | ${lang} | ${exs.length} | ${exs.map((e: any) => e.id).join('; ')} |`);
    }
    if (dupNameLang.length > 200) push(`\n_(showing first 200 of ${dupNameLang.length} groups)_`);
  }
  push();
  push('---');
  push();
  push('## Outputs');
  push();
  push('- [`02-catalog-gaps.csv`](02-catalog-gaps.csv) — one row per exercise with any missing field');
  push('  or suspicious value.');
  push('- [`02-coverage-matrix.csv`](02-coverage-matrix.csv) — full `programId × level × location`');
  push('  matrix.');
  push();
  push('No values were changed. No migration was run.');
  push();

  return lines.join('\n');
}

main().catch(e => { console.error(e); process.exit(1); });
