/**
 * scripts/inventory-core-exercises.ts — READ ONLY. Phase 0 exercise inventory.
 *
 * Pulls the entire `exercises` Firestore collection and emits:
 *   1. exercise-inventory.csv  (repo root) — every exercise, all requested columns
 *   2. a console summary — totals, core_candidate breakdown, notable gaps
 *
 * NO writes, NO seeding, NO uploads. Mapping only.
 *
 * Usage:  npx tsx scripts/inventory-core-exercises.ts
 * Needs:  .env.local with FIREBASE_SERVICE_ACCOUNT_KEY (or ADC + FIREBASE_PROJECT_ID)
 *
 * Field-access shapes verified against production-reading siblings:
 *   scripts/list-park-exercises-missing-fullTutorial.ts,
 *   scripts/export-park-exercises-need-fullTutorial.ts,
 *   scripts/audit-media-integrity.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ── Firebase init (read-only) ────────────────────────────────────────────────
function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    const c = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
    return;
  }
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'appout-1',
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const CORE_MUSCLES = new Set(['abs', 'core', 'obliques']);

function toArr<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}
function nameHe(ex: any): string {
  const n = ex?.name;
  if (!n) return ex?.id ?? '';
  if (typeof n === 'string') return n;
  return n.he ?? n.en ?? ex?.id ?? '';
}
/** videoId present in any locale of a Localized video slot */
function hasVid(slot: any): boolean {
  return !!(slot?.he?.videoId || slot?.en?.videoId);
}
function hasVidHe(slot: any): boolean {
  return !!slot?.he?.videoId;
}
/** CSV cell: always quoted, internal quotes doubled, newlines flattened */
function cell(v: any): string {
  const s = v === null || v === undefined ? '' : String(v);
  return '"' + s.replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
}

interface Row {
  id: string;
  name_he: string;
  primaryMuscle: string;
  secondaryMuscles: string;
  muscleGroups: string;
  movementGroup: string;
  movementType: string;
  programIds: string;            // resolved to slugs
  targetPrograms: string;        // slug:level
  exec_locations: string;
  exec_methods_count: number;
  video_fullTutorial_he_per_method: string;
  has_fullTutorial_he_any: boolean;
  has_any_video: boolean;
  tags: string;
  exerciseRole: string;
  isFollowAlong: string;
  isFinisherVideo: string;
  fieldReady: string;
  gap_no_primaryMuscle: boolean;
  gap_no_targetPrograms_or_level: boolean;
  gap_no_execution_methods: boolean;
  gap_no_video: boolean;
  core_candidate: boolean;       // dedicated-core, per Phase-0 rule (programId resolved to slug)
  core_secondary: boolean;       // core is a SECONDARY muscle only (accessory engagement)
  core_role: string;             // 'primary' | 'secondary' | ''
}

const COLUMNS: (keyof Row)[] = [
  'id', 'name_he', 'primaryMuscle', 'secondaryMuscles', 'muscleGroups',
  'movementGroup', 'movementType', 'programIds', 'targetPrograms',
  'exec_locations', 'exec_methods_count', 'video_fullTutorial_he_per_method',
  'has_fullTutorial_he_any', 'has_any_video', 'tags', 'exerciseRole',
  'isFollowAlong', 'isFinisherVideo', 'fieldReady',
  'gap_no_primaryMuscle', 'gap_no_targetPrograms_or_level',
  'gap_no_execution_methods', 'gap_no_video',
  'core_candidate', 'core_secondary', 'core_role',
];

async function main() {
  initFirebase();
  const db = admin.firestore();

  // programs: doc-id -> slug (programId in exercises is a doc-ID, NOT a slug)
  console.log('Fetching `programs` collection…');
  const progSnap = await db.collection('programs').get();
  const progSlug = new Map<string, string>();
  let coreProgId = '';
  for (const d of progSnap.docs) {
    const p = d.data() as any;
    const slug = String(p.slug ?? '');
    progSlug.set(d.id, slug);
    if (slug === 'core' || (p.movementPattern ?? p.movement_pattern) === 'core') coreProgId = d.id;
  }
  const slugOf = (id: string): string => progSlug.get(id) || id;
  console.log(`  programs: ${progSnap.size} · core program doc-id: ${coreProgId || '(none)'}`);

  console.log('Fetching `exercises` collection…');
  const snap = await db.collection('exercises').get();
  console.log(`  Total exercises: ${snap.size}`);

  // parsing diagnostics — confirm we're reading the right field conventions
  let usedSnake = 0, usedCamel = 0, hadTargetPrograms = 0, hadProgramIds = 0;

  const rows: Row[] = [];

  for (const doc of snap.docs) {
    const ex = doc.data() as any;

    const methodsSnake = toArr(ex.execution_methods);
    const methodsCamel = toArr(ex.executionMethods);
    if (methodsSnake.length) usedSnake++;
    if (methodsCamel.length) usedCamel++;
    const methods = methodsSnake.length ? methodsSnake : methodsCamel;

    const primaryMuscle: string = ex.primaryMuscle ?? '';
    const secondaryMuscles = toArr<string>(ex.secondaryMuscles);
    const muscleGroups = toArr<string>(ex.muscleGroups);
    const movementGroup: string = ex.movementGroup ?? '';
    const programIds = toArr<string>(ex.programIds);
    const targetPrograms = toArr<any>(ex.targetPrograms);
    if (targetPrograms.length) hadTargetPrograms++;
    if (programIds.length) hadProgramIds++;

    // locations across all methods
    const locSet = new Set<string>();
    for (const m of methods) {
      if (m?.location) locSet.add(String(m.location));
      for (const l of toArr<string>(m?.locationMapping)) locSet.add(String(l));
    }

    // per-method fullTutorial.he presence (+ exercise-root fallback)
    const rootFullHe = hasVidHe(ex.media?.fullTutorial);
    const perMethod = methods.map((m: any) => {
      const loc = toArr<string>(m?.locationMapping).join('+') || m?.location || '?';
      const ftHe = hasVidHe(m?.media?.fullTutorial) || rootFullHe;
      return `${loc}[ft_he:${ftHe ? 'y' : 'n'}]`;
    }).join(' | ');

    // rollups
    const hasFullHeAny =
      rootFullHe || methods.some((m: any) => hasVidHe(m?.media?.fullTutorial));
    const hasAnyVideo =
      hasVid(ex.media?.fullTutorial) || hasVid(ex.media?.previewVideo) ||
      methods.some((m: any) =>
        hasVid(m?.media?.fullTutorial) ||
        hasVid(m?.media?.previewVideo) ||
        !!m?.media?.mainVideoUrl,
      );

    // targetPrograms formatting (slug:level) + level-completeness check
    const tpStr = targetPrograms
      .map((t: any) => `${slugOf(String(t?.programId ?? '?'))}:${t?.level ?? '?'}`)
      .join(' | ');
    const tpMissingOrNoLevel =
      targetPrograms.length === 0 ||
      targetPrograms.some((t: any) => t?.level === undefined || t?.level === null);

    // core_candidate — Phase-0 rule (programId resolved to slug via programs collection)
    const core_candidate =
      CORE_MUSCLES.has(primaryMuscle) ||
      movementGroup === 'core' ||
      targetPrograms.some((t: any) => slugOf(String(t?.programId ?? '')) === 'core') ||
      muscleGroups.some((mg) => CORE_MUSCLES.has(mg));

    // core as a SECONDARY muscle only (accessory engagement, not dedicated)
    const core_secondary = !core_candidate && secondaryMuscles.some((s) => CORE_MUSCLES.has(s));
    const core_role = core_candidate ? 'primary' : (core_secondary ? 'secondary' : '');

    rows.push({
      id: doc.id,
      name_he: nameHe({ ...ex, id: doc.id }),
      primaryMuscle,
      secondaryMuscles: secondaryMuscles.join('|'),
      muscleGroups: muscleGroups.join('|'),
      movementGroup,
      movementType: ex.movementType ?? '',
      programIds: programIds.map((p) => slugOf(p)).join('|'),
      targetPrograms: tpStr,
      exec_locations: Array.from(locSet).join('|'),
      exec_methods_count: methods.length,
      video_fullTutorial_he_per_method: perMethod,
      has_fullTutorial_he_any: hasFullHeAny,
      has_any_video: hasAnyVideo,
      tags: toArr<string>(ex.tags).join('|'),
      exerciseRole: ex.exerciseRole ?? '',
      isFollowAlong: ex.isFollowAlong === undefined ? '' : String(!!ex.isFollowAlong),
      isFinisherVideo: ex.isFinisherVideo === undefined ? '' : String(!!ex.isFinisherVideo),
      fieldReady: ex.fieldReady === undefined ? '' : String(!!ex.fieldReady),
      gap_no_primaryMuscle: !primaryMuscle,
      gap_no_targetPrograms_or_level: tpMissingOrNoLevel,
      gap_no_execution_methods: methods.length === 0,
      gap_no_video: !hasAnyVideo,
      core_candidate,
      core_secondary,
      core_role,
    });
  }

  // ── Write CSV (UTF-8 BOM so Excel renders Hebrew) ──────────────────────────
  const header = COLUMNS.join(',');
  const body = rows
    .sort((a, b) => Number(b.core_candidate) - Number(a.core_candidate) || a.name_he.localeCompare(b.name_he))
    .map((r) => COLUMNS.map((c) => cell(r[c])).join(','))
    .join('\n');
  const outPath = path.join(process.cwd(), 'exercise-inventory.csv');
  fs.writeFileSync(outPath, '﻿' + header + '\n' + body + '\n', 'utf8');

  // ── Summary ────────────────────────────────────────────────────────────────
  const cand = rows.filter((r) => r.core_candidate);
  const secondaryOnly = rows.filter((r) => r.core_secondary);
  const n = (arr: Row[], f: (r: Row) => boolean) => arr.filter(f).length;

  console.log('\n════════ EXERCISE INVENTORY — Phase 0 (READ ONLY) ════════');
  console.log(`  CSV written: ${outPath}`);
  console.log(`\n  Total exercises:               ${rows.length}`);
  console.log(`  core_candidate (DEDICATED):    ${cand.length}`);
  console.log(`  core as SECONDARY muscle only: ${secondaryOnly.length}`);
  console.log(`  any core involvement (union):  ${cand.length + secondaryOnly.length}`);

  console.log('\n  ── Core candidates — gap breakdown ──');
  console.log(`    no primaryMuscle:            ${n(cand, (r) => r.gap_no_primaryMuscle)}`);
  console.log(`    no targetPrograms / level:   ${n(cand, (r) => r.gap_no_targetPrograms_or_level)}`);
  console.log(`    no execution_methods:        ${n(cand, (r) => r.gap_no_execution_methods)}`);
  console.log(`    no video (any kind):         ${n(cand, (r) => r.gap_no_video)}`);
  console.log(`    no fullTutorial.he (any):    ${n(cand, (r) => !r.has_fullTutorial_he_any)}`);

  console.log('\n  ── Whole collection — gap breakdown ──');
  console.log(`    no primaryMuscle:            ${n(rows, (r) => r.gap_no_primaryMuscle)}`);
  console.log(`    no targetPrograms / level:   ${n(rows, (r) => r.gap_no_targetPrograms_or_level)}`);
  console.log(`    no execution_methods:        ${n(rows, (r) => r.gap_no_execution_methods)}`);
  console.log(`    no video (any kind):         ${n(rows, (r) => r.gap_no_video)}`);
  console.log(`    no fullTutorial.he (any):    ${n(rows, (r) => !r.has_fullTutorial_he_any)}`);

  // trigger reasons for core candidates (targetPrograms now slug-based)
  const byPrimary = n(cand, (r) => CORE_MUSCLES.has(r.primaryMuscle));
  const byMovement = n(cand, (r) => r.movementGroup === 'core');
  const byTargetProg = n(cand, (r) => r.targetPrograms.split(' | ').some((t) => t.startsWith('core:')));
  const byMuscleGroups = n(cand, (r) => r.muscleGroups.split('|').some((m) => CORE_MUSCLES.has(m)));
  console.log('\n  ── Core candidates — which rule fired (overlapping) ──');
  console.log(`    primaryMuscle ∈ {abs,core,obliques}: ${byPrimary}`);
  console.log(`    movementGroup = 'core':              ${byMovement}`);
  console.log(`    targetPrograms has programId 'core': ${byTargetProg}`);
  console.log(`    muscleGroups has abs/core/obliques:  ${byMuscleGroups}`);

  console.log('\n  ── Parsing diagnostics (sanity) ──');
  console.log(`    docs using execution_methods (snake): ${usedSnake}`);
  console.log(`    docs using executionMethods (camel):  ${usedCamel}`);
  console.log(`    docs with targetPrograms[]:           ${hadTargetPrograms}`);
  console.log(`    docs with programIds[]:               ${hadProgramIds}`);

  // list core candidates (compact) for eyeballing
  console.log('\n  ── Core candidates (compact) ──');
  console.table(
    cand.slice(0, 60).map((r) => ({
      id: r.id.slice(0, 12),
      name: r.name_he,
      primary: r.primaryMuscle,
      mvGroup: r.movementGroup,
      tPrograms: r.targetPrograms.slice(0, 24),
      locs: r.exec_locations,
      ftHe: r.has_fullTutorial_he_any ? 'y' : '—',
    })),
  );
  if (cand.length > 60) console.log(`    … +${cand.length - 60} more core candidates in CSV`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
