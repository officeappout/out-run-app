/**
 * scripts/audit/analyze-benchmark.ts — READ ONLY. Reads scripts/audit/snapshot.sqlite
 * only (already built by build-exercise-bridge.ts + build-snapshot.ts). No Firestore,
 * no writes anywhere. Computes every number docs/workout-engine/05-BENCHMARK.md needs
 * and writes them to scripts/audit/benchmark-results.json for the report to be
 * hand-composed from (matches the established pattern: analysis script produces
 * grounded numbers, the markdown report is then written with judgment/caveats, not
 * auto-generated prose).
 *
 * Run:  npx tsx scripts/audit/analyze-benchmark.ts
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SNAPSHOT_DB_PATH = path.join(REPO_ROOT, 'scripts', 'audit', 'snapshot.sqlite');
const OUT_PATH = path.join(REPO_ROOT, 'scripts', 'audit', 'benchmark-results.json');

const db = new Database(SNAPSHOT_DB_PATH, { readonly: true });

// ============================================================================
// Shared: old-corpus "real workout" filter = targetid IN (13..18) AND active=1
// (verified 2026-09-04: this is EXACTLY the set of active=1 rows in the whole
// DB — 480 workouts — every active workout belongs to one of these 6 targets).
// ============================================================================

const OLD_REAL_FILTER = `w.targetid IN (13,14,15,16,17,18) AND w.active = 1`;

// ============================================================================
// PART A — old-corpus block-category classification (methodology validation)
// ============================================================================

function classifyOldBlocks() {
  const rows = db.prepare(`
    SELECT ws.id AS setid, ws.title, ws.repeats,
      CASE
        WHEN ws.title LIKE 'יעד כפול%' OR ws.title LIKE 'סופר סט%' THEN 'paired'
        WHEN ws.title LIKE 'יעד%' THEN 'target'
        WHEN ws.title LIKE 'חימום%' THEN 'warmup'
        WHEN ws.title LIKE 'סיום%' OR ws.title = 'לסיום' THEN 'finisher'
        WHEN ws.title = 'ליבה' OR ws.title LIKE 'חיזוק ליבה%' OR ws.title LIKE 'חיזוק בטן%' THEN 'core'
        ELSE 'other'
      END AS category,
      -- exerciseid=0 is a rest/hold-timer placeholder row, not a real exercise —
      -- confirmed 2026-09-04: id=0 does not exist in legacy_exercises (INNER JOIN
      -- silently drops it elsewhere in this file), and every exerciseid=0 row has
      -- min===max at round rest-interval values (30/45/60/75/90/105/120/150/180s).
      -- Counting it as an exercise would nearly double-count single-exercise target
      -- blocks (measured 1273/1421 "target" blocks as n_exercises=2 before this fix
      -- — almost all were 1 real exercise + 1 rest-marker row, not 2 exercises).
      (SELECT COUNT(*) FROM legacy_set_exercises se WHERE se.setid = ws.id AND se.exerciseid != 0) AS n_exercises
    FROM legacy_workout_sets ws
    JOIN legacy_workouts w ON ws.workoutid = w.id
    WHERE ${OLD_REAL_FILTER}
  `).all() as { setid: number; title: string; repeats: number; category: string; n_exercises: number }[];

  const total = rows.length;
  const byCategory: Record<string, { n: number; pct: number }> = {};
  for (const cat of ['target', 'warmup', 'finisher', 'paired', 'core', 'other']) {
    const n = rows.filter(r => r.category === cat).length;
    byCategory[cat] = { n, pct: Math.round((n / total) * 1000) / 10 };
  }

  // % of target blocks matching the 1-exercise × 2-4-round shape
  const targetBlocks = rows.filter(r => r.category === 'target');
  const targetConforming = targetBlocks.filter(r => r.n_exercises === 1 && r.repeats >= 2 && r.repeats <= 4).length;

  // % of workouts containing at least one paired block
  const workoutsWithPaired = db.prepare(`
    SELECT COUNT(DISTINCT w.id) AS n
    FROM legacy_workouts w
    JOIN legacy_workout_sets ws ON ws.workoutid = w.id
    WHERE ${OLD_REAL_FILTER} AND (ws.title LIKE 'יעד כפול%' OR ws.title LIKE 'סופר סט%')
  `).get() as { n: number };
  const totalRealWorkouts = (db.prepare(`SELECT COUNT(*) AS n FROM legacy_workouts w WHERE ${OLD_REAL_FILTER}`).get() as { n: number }).n;

  // target blocks per workout, by duration bucket (old `minutes` field)
  const byDuration = db.prepare(`
    SELECT w.minutes,
      COUNT(*) AS n_target_blocks,
      COUNT(DISTINCT w.id) AS n_workouts
    FROM legacy_workouts w
    JOIN legacy_workout_sets ws ON ws.workoutid = w.id
    WHERE ${OLD_REAL_FILTER} AND ws.title LIKE 'יעד%' AND ws.title NOT LIKE 'יעד כפול%'
    GROUP BY w.minutes
    ORDER BY w.minutes
  `).all() as { minutes: number; n_target_blocks: number; n_workouts: number }[];

  return {
    totalBlocks: total,
    totalRealWorkouts,
    byCategory,
    targetBlockCount: targetBlocks.length,
    targetConformingPct: Math.round((targetConforming / targetBlocks.length) * 1000) / 10,
    pctWorkoutsWithPaired: Math.round((workoutsWithPaired.n / totalRealWorkouts) * 1000) / 10,
    targetBlocksByDuration: byDuration.map(d => ({ minutes: d.minutes, avgTargetBlocksPerWorkout: Math.round((d.n_target_blocks / d.n_workouts) * 100) / 100, nWorkouts: d.n_workouts })),
  };
}

// ============================================================================
// PART B — new-generator block derivation + א/ב/ג classification
// ============================================================================

interface WERow {
  run_id: string; position: number; exercise_id: string; name: string;
  exercise_role: string | null; domain: string | null; sets: number | null;
  paired_with: string | null; superset_type: string | null;
  protocol_block: string | null; pyramid_sequence: string | null;
}
interface WRow { run_id: string; req_duration: number; applied_protocol: string | null; }

interface Block {
  run_id: string; kind: string; category: 'א' | 'ב' | 'ג'; label: string;
  n_exercises: number; sets: number | null; exerciseNames: string[]; domain: string | null;
}

function deriveNewBlocks(): Block[] {
  const exRows = db.prepare(`
    SELECT run_id, position, exercise_id, name, exercise_role, domain, sets, paired_with, superset_type, protocol_block, pyramid_sequence
    FROM workout_exercises ORDER BY run_id, position
  `).all() as WERow[];
  const wRows = db.prepare(`SELECT run_id, req_duration, applied_protocol FROM workouts`).all() as WRow[];
  const wMeta = new Map(wRows.map(w => [w.run_id, w]));

  const byRun = new Map<string, WERow[]>();
  for (const r of exRows) {
    if (!byRun.has(r.run_id)) byRun.set(r.run_id, []);
    byRun.get(r.run_id)!.push(r);
  }

  const blocks: Block[] = [];

  for (const [runId, exs] of Array.from(byRun)) {
    const meta = wMeta.get(runId);
    const warmups = exs.filter(e => e.exercise_role === 'warmup');
    const cooldowns = exs.filter(e => e.exercise_role === 'cooldown');
    const mains = exs.filter(e => e.exercise_role === 'main' || e.exercise_role === null);

    if (warmups.length > 0) {
      blocks.push({
        run_id: runId, kind: 'warmup', category: (warmups.length >= 1 && warmups.length <= 6) ? 'א' : 'ג',
        label: 'חימום', n_exercises: warmups.length, sets: null,
        exerciseNames: warmups.map(w => w.name), domain: null,
      });
    }
    if (cooldowns.length > 0) {
      blocks.push({
        run_id: runId, kind: 'finisher', category: (cooldowns.length >= 1 && cooldowns.length <= 3) ? 'א' : 'ג',
        label: 'סיום', n_exercises: cooldowns.length, sets: null,
        exerciseNames: cooldowns.map(w => w.name), domain: null,
      });
    }

    // Tabata block
    const tabataExs = mains.filter(e => e.protocol_block === 'tabata');
    const nonTabataMains = mains.filter(e => e.protocol_block !== 'tabata');
    if (tabataExs.length > 0) {
      blocks.push({
        run_id: runId, kind: 'tabata', category: 'ב', label: 'טבאטה (יכולת חדשה)',
        n_exercises: tabataExs.length, sets: tabataExs[0]?.sets ?? null,
        exerciseNames: tabataExs.map(w => w.name), domain: null,
      });
    }

    // Pyramid block
    const pyramidExs = nonTabataMains.filter(e => e.pyramid_sequence);
    const nonPyramidMains = nonTabataMains.filter(e => !e.pyramid_sequence);
    if (pyramidExs.length > 0) {
      blocks.push({
        run_id: runId, kind: 'pyramid', category: 'ב', label: 'פירמידה (יכולת חדשה)',
        n_exercises: pyramidExs.length, sets: pyramidExs[0]?.sets ?? null,
        exerciseNames: pyramidExs.map(w => w.name), domain: null,
      });
    }

    // EMOM — workout-level protocol, no per-exercise marker; classify the whole
    // non-tabata/non-pyramid main section as one EMOM block when it fires.
    if (meta?.applied_protocol === 'emom' && nonPyramidMains.length > 0) {
      blocks.push({
        run_id: runId, kind: 'emom', category: 'ב', label: 'EMOM (יכולת חדשה)',
        n_exercises: nonPyramidMains.length, sets: nonPyramidMains[0]?.sets ?? null,
        exerciseNames: nonPyramidMains.map(w => w.name), domain: null,
      });
      continue; // already consumed all mains for this run
    }

    // Paired (pairedWith set) — group by pairedWith target name into 2-exercise blocks.
    const seen = new Set<string>();
    const remaining: WERow[] = [];
    for (const e of nonPyramidMains) {
      if (seen.has(e.exercise_id)) continue;
      if (e.paired_with) {
        const partner = nonPyramidMains.find(o => o.exercise_id !== e.exercise_id && !seen.has(o.exercise_id) &&
          (o.paired_with === e.name || o.paired_with === e.exercise_id || e.paired_with === o.name || e.paired_with === o.exercise_id));
        if (partner) {
          seen.add(e.exercise_id); seen.add(partner.exercise_id);
          const isAntagonist = e.superset_type === 'staggered' || partner.superset_type === 'staggered';
          if (isAntagonist || meta?.applied_protocol === 'antagonist_pair') {
            blocks.push({
              run_id: runId, kind: 'antagonist_pair', category: 'ב', label: 'זוג אנטגוניסטי (יכולת חדשה)',
              n_exercises: 2, sets: e.sets, exerciseNames: [e.name, partner.name], domain: null,
            });
          } else {
            const shapeOk = e.sets !== null && e.sets >= 2 && e.sets <= 4 && e.sets === partner.sets;
            blocks.push({
              run_id: runId, kind: 'paired', category: shapeOk ? 'א' : 'ג', label: 'יעד כפול / סופר סט',
              n_exercises: 2, sets: e.sets, exerciseNames: [e.name, partner.name], domain: null,
            });
          }
          continue;
        }
      }
      remaining.push(e);
    }

    // Standalone main exercises → target or core block, 1 exercise each.
    for (const e of remaining) {
      if (seen.has(e.exercise_id)) continue;
      seen.add(e.exercise_id);
      if (e.domain === 'core') {
        blocks.push({
          run_id: runId, kind: 'core', category: (e.sets === 2) ? 'א' : 'ג', label: 'ליבה',
          n_exercises: 1, sets: e.sets, exerciseNames: [e.name], domain: 'core',
        });
      } else {
        const shapeOk = e.sets !== null && e.sets >= 2 && e.sets <= 4;
        blocks.push({
          run_id: runId, kind: 'target', category: shapeOk ? 'א' : 'ג', label: 'יעד',
          n_exercises: 1, sets: e.sets, exerciseNames: [e.name], domain: e.domain,
        });
      }
    }
  }

  return blocks;
}

function analyzeNewBlocks(blocks: Block[]) {
  const total = blocks.length;
  const byLabel: Record<string, { n: number; pct: number; category: string }> = {};
  for (const b of blocks) {
    const key = b.label;
    if (!byLabel[key]) byLabel[key] = { n: 0, pct: 0, category: b.category };
    byLabel[key].n++;
  }
  for (const k of Object.keys(byLabel)) byLabel[k].pct = Math.round((byLabel[k].n / total) * 1000) / 10;

  const byCategoryTotals = { א: 0, ב: 0, ג: 0 };
  for (const b of blocks) byCategoryTotals[b.category]++;

  const suspicious = blocks.filter(b => b.category === 'ג');

  // Target-blocks-per-workout by duration
  const wRows = db.prepare(`SELECT run_id, req_duration FROM workouts`).all() as { run_id: string; req_duration: number }[];
  const durationByRun = new Map(wRows.map(w => [w.run_id, w.req_duration]));
  const targetBlocksByRun = new Map<string, number>();
  for (const b of blocks) {
    if (b.kind === 'target') targetBlocksByRun.set(b.run_id, (targetBlocksByRun.get(b.run_id) ?? 0) + 1);
  }
  const durationAgg = new Map<number, { sum: number; n: number }>();
  for (const runId of Array.from(durationByRun.keys())) {
    const dur = durationByRun.get(runId)!;
    const n = targetBlocksByRun.get(runId) ?? 0;
    if (!durationAgg.has(dur)) durationAgg.set(dur, { sum: 0, n: 0 });
    const agg = durationAgg.get(dur)!;
    agg.sum += n; agg.n += 1;
  }
  const targetBlocksByDuration = Array.from(durationAgg.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([minutes, agg]) => ({ minutes, avgTargetBlocksPerWorkout: Math.round((agg.sum / agg.n) * 100) / 100, nWorkouts: agg.n }));

  // % of runs containing at least one paired/antagonist block
  const runsWithPairing = new Set(blocks.filter(b => b.kind === 'paired' || b.kind === 'antagonist_pair').map(b => b.run_id));
  const totalRuns = durationByRun.size;

  return {
    totalBlocks: total,
    byLabel,
    byCategoryTotals,
    suspiciousCount: suspicious.length,
    suspiciousSample: suspicious.slice(0, 60), // full list capped for report size; note in report if capped
    targetBlocksByDuration,
    pctRunsWithPairing: Math.round((runsWithPairing.size / totalRuns) * 1000) / 10,
    totalRuns,
  };
}

// ============================================================================
// PART C.1 — Level placement (per bridged exercise, old workouts.level vs new user_domain_level)
// ============================================================================

function median(nums: number[]): number {
  if (nums.length === 0) return NaN;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function analyzeLevelPlacement() {
  const bridged = db.prepare(`SELECT new_id, new_name, old_id, old_name FROM exercise_bridge WHERE match_type != 'none'`).all() as
    { new_id: string; new_name: string; old_id: number; old_name: string }[];

  const oldLevelsStmt = db.prepare(`
    SELECT w.level AS lvl
    FROM legacy_set_exercises se
    JOIN legacy_workout_sets ws ON se.setid = ws.id
    JOIN legacy_workouts w ON ws.workoutid = w.id
    WHERE se.exerciseid = ? AND ${OLD_REAL_FILTER}
  `);
  const newLevelsStmt = db.prepare(`SELECT user_domain_level AS lvl FROM workout_exercises WHERE exercise_id = ? AND user_domain_level IS NOT NULL`);

  const rows: { new_name: string; old_name: string; oldMedian: number; newMedian: number; gap: number; oldN: number; newN: number }[] = [];
  for (const b of bridged) {
    const oldLvls = (oldLevelsStmt.all(b.old_id) as { lvl: number }[]).map(r => r.lvl);
    const newLvls = (newLevelsStmt.all(b.new_id) as { lvl: number }[]).map(r => r.lvl);
    if (oldLvls.length === 0 || newLvls.length === 0) continue;
    const oldMedian = median(oldLvls);
    const newMedian = median(newLvls);
    rows.push({ new_name: b.new_name, old_name: b.old_name, oldMedian, newMedian, gap: Math.abs(oldMedian - newMedian), oldN: oldLvls.length, newN: newLvls.length });
  }
  rows.sort((a, b) => b.gap - a.gap);
  return { comparable: rows.length, totalBridged: bridged.length, top30: rows.slice(0, 30) };
}

// ============================================================================
// PART C.2 — Co-occurrence pairs
// ============================================================================

function analyzeCoOccurrence() {
  // Old pairs, keyed by old_id (only for old_ids that have SOME bridge entry).
  const bridgedOldIds = new Set((db.prepare(`SELECT DISTINCT old_id FROM exercise_bridge WHERE match_type != 'none'`).all() as { old_id: number }[]).map(r => r.old_id));
  const oldWorkoutExercises = db.prepare(`
    SELECT w.id AS workout_id, se.exerciseid AS old_id
    FROM legacy_set_exercises se
    JOIN legacy_workout_sets ws ON se.setid = ws.id
    JOIN legacy_workouts w ON ws.workoutid = w.id
    WHERE ${OLD_REAL_FILTER}
  `).all() as { workout_id: number; old_id: number }[];
  const oldByWorkout = new Map<number, Set<number>>();
  for (const r of oldWorkoutExercises) {
    if (!bridgedOldIds.has(r.old_id)) continue;
    if (!oldByWorkout.has(r.workout_id)) oldByWorkout.set(r.workout_id, new Set());
    oldByWorkout.get(r.workout_id)!.add(r.old_id);
  }
  const oldPairCounts = new Map<string, number>();
  for (const set of Array.from(oldByWorkout.values())) {
    const arr = Array.from(set).sort((a, b) => a - b);
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++)
        oldPairCounts.set(`${arr[i]}_${arr[j]}`, (oldPairCounts.get(`${arr[i]}_${arr[j]}`) ?? 0) + 1);
  }
  const oldTotalWorkouts = oldByWorkout.size;

  // New pairs, mapped through bridge to old_id space.
  const newIdToOldId = new Map((db.prepare(`SELECT new_id, old_id FROM exercise_bridge WHERE match_type != 'none'`).all() as { new_id: string; old_id: number }[]).map(r => [r.new_id, r.old_id]));
  const newExRows = db.prepare(`SELECT run_id, exercise_id FROM workout_exercises`).all() as { run_id: string; exercise_id: string }[];
  const newByRun = new Map<string, Set<number>>();
  for (const r of newExRows) {
    const oldId = newIdToOldId.get(r.exercise_id);
    if (oldId === undefined) continue;
    if (!newByRun.has(r.run_id)) newByRun.set(r.run_id, new Set());
    newByRun.get(r.run_id)!.add(oldId);
  }
  const newPairCounts = new Map<string, number>();
  for (const set of Array.from(newByRun.values())) {
    const arr = Array.from(set).sort((a, b) => a - b);
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++)
        newPairCounts.set(`${arr[i]}_${arr[j]}`, (newPairCounts.get(`${arr[i]}_${arr[j]}`) ?? 0) + 1);
  }
  const newTotalRuns = newByRun.size;

  const nameStmt = db.prepare(`SELECT title FROM legacy_exercises WHERE id = ?`);
  function nameOf(id: number): string {
    const r = nameStmt.get(id) as { title: string } | undefined;
    return r?.title ?? `#${id}`;
  }

  const oldRatePairs = Array.from(oldPairCounts.entries()).map(([key, oldCount]) => {
    const [a, b] = key.split('_').map(Number);
    const newCount = newPairCounts.get(key) ?? 0;
    return { a, b, nameA: nameOf(a), nameB: nameOf(b), oldCount, newCount, oldRate: oldCount / oldTotalWorkouts, newRate: newCount / newTotalRuns };
  });
  const oldCommonNewRare = [...oldRatePairs].sort((x, y) => (y.oldRate - y.newRate) - (x.oldRate - x.newRate)).slice(0, 20);

  const newOnlyPairs = Array.from(newPairCounts.entries())
    .filter(([key]) => (oldPairCounts.get(key) ?? 0) === 0)
    .map(([key, newCount]) => {
      const [a, b] = key.split('_').map(Number);
      return { a, b, nameA: nameOf(a), nameB: nameOf(b), newCount, oldCount: 0 };
    })
    .sort((x, y) => y.newCount - x.newCount)
    .slice(0, 20);

  return { oldTotalWorkouts, newTotalRuns, oldCommonNewRare, newCommonOldNever: newOnlyPairs };
}

// ============================================================================
// PART C.3 — Block position (warmup/target/finisher) mismatches
// ============================================================================

function analyzeBlockPosition() {
  const bridged = db.prepare(`SELECT new_id, new_name, old_id, old_name FROM exercise_bridge WHERE match_type != 'none'`).all() as
    { new_id: string; new_name: string; old_id: number; old_name: string }[];

  const oldPositionStmt = db.prepare(`
    SELECT
      CASE
        WHEN ws.title LIKE 'חימום%' THEN 'warmup'
        WHEN ws.title LIKE 'סיום%' OR ws.title = 'לסיום' THEN 'finisher'
        WHEN ws.title LIKE 'יעד כפול%' OR ws.title LIKE 'סופר סט%' THEN 'paired'
        WHEN ws.title LIKE 'יעד%' THEN 'target'
        ELSE 'other'
      END AS pos
    FROM legacy_set_exercises se
    JOIN legacy_workout_sets ws ON se.setid = ws.id
    JOIN legacy_workouts w ON ws.workoutid = w.id
    WHERE se.exerciseid = ? AND ${OLD_REAL_FILTER}
  `);
  const newPositionStmt = db.prepare(`SELECT exercise_role FROM workout_exercises WHERE exercise_id = ?`);

  const results: { new_name: string; old_name: string; oldWarmupPct: number; oldMainPct: number; newMainPct: number; newWarmupPct: number; oldN: number; newN: number; flag: string | null }[] = [];
  for (const b of bridged) {
    const oldPos = (oldPositionStmt.all(b.old_id) as { pos: string }[]).map(r => r.pos);
    const newPos = (newPositionStmt.all(b.new_id) as { exercise_role: string | null }[]).map(r => r.exercise_role);
    if (oldPos.length === 0 || newPos.length === 0) continue;
    const oldWarmupPct = Math.round((oldPos.filter(p => p === 'warmup').length / oldPos.length) * 1000) / 10;
    const oldMainPct = Math.round((oldPos.filter(p => p === 'target' || p === 'paired').length / oldPos.length) * 1000) / 10;
    const newMainPct = Math.round((newPos.filter(p => p === 'main').length / newPos.length) * 1000) / 10;
    const newWarmupPct = Math.round((newPos.filter(p => p === 'warmup').length / newPos.length) * 1000) / 10;

    let flag: string | null = null;
    if (oldWarmupPct >= 80 && newMainPct >= 80) flag = 'old=warmup, new=main';
    else if (oldMainPct >= 80 && newWarmupPct >= 80) flag = 'old=main, new=warmup';

    results.push({ new_name: b.new_name, old_name: b.old_name, oldWarmupPct, oldMainPct, newMainPct, newWarmupPct, oldN: oldPos.length, newN: newPos.length, flag });
  }
  const flagged = results.filter(r => r.flag !== null);
  return { comparable: results.length, flagged };
}

// ============================================================================
// PART C.4 — Rep range comparison
// ============================================================================

function analyzeRepRanges() {
  const bridged = db.prepare(`SELECT new_id, new_name, old_id, old_name FROM exercise_bridge WHERE match_type != 'none'`).all() as
    { new_id: string; new_name: string; old_id: number; old_name: string }[];

  const oldRangeStmt = db.prepare(`
    SELECT se.min AS mn, se.max AS mx
    FROM legacy_set_exercises se
    JOIN legacy_workout_sets ws ON se.setid = ws.id
    JOIN legacy_workouts w ON ws.workoutid = w.id
    WHERE se.exerciseid = ? AND ${OLD_REAL_FILTER} AND se.min IS NOT NULL AND se.max IS NOT NULL AND se.max > 0
  `);
  const newRangeStmt = db.prepare(`SELECT reps FROM workout_exercises WHERE exercise_id = ? AND is_time_based = 0 AND reps IS NOT NULL AND reps > 0`);

  const results: { new_name: string; old_name: string; oldMin: number; oldMax: number; newMedianReps: number; ratio: number; oldN: number; newN: number }[] = [];
  for (const b of bridged) {
    const oldRanges = oldRangeStmt.all(b.old_id) as { mn: number; mx: number }[];
    const newReps = (newRangeStmt.all(b.new_id) as { reps: number }[]).map(r => r.reps);
    if (oldRanges.length === 0 || newReps.length === 0) continue;
    const oldMinMedian = median(oldRanges.map(r => r.mn));
    const oldMaxMedian = median(oldRanges.map(r => r.mx));
    const newMedianReps = median(newReps);
    const oldMidpoint = (oldMinMedian + oldMaxMedian) / 2;
    if (oldMidpoint <= 0 || newMedianReps <= 0) continue;
    const ratio = Math.max(newMedianReps / oldMidpoint, oldMidpoint / newMedianReps);
    results.push({ new_name: b.new_name, old_name: b.old_name, oldMin: oldMinMedian, oldMax: oldMaxMedian, newMedianReps, ratio: Math.round(ratio * 100) / 100, oldN: oldRanges.length, newN: newReps.length });
  }
  results.sort((a, b) => b.ratio - a.ratio);
  const twoXPlus = results.filter(r => r.ratio >= 2);
  return { comparable: results.length, twoXPlusCount: twoXPlus.length, twoXPlus: twoXPlus.slice(0, 40) };
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log('Part A: old-corpus block classification...');
  const oldBlocks = classifyOldBlocks();

  console.log('Part B: new-generator block derivation...');
  const newBlockList = deriveNewBlocks();
  const newBlocks = analyzeNewBlocks(newBlockList);

  console.log('Part C.1: level placement...');
  const levelPlacement = analyzeLevelPlacement();

  console.log('Part C.2: co-occurrence...');
  const coOccurrence = analyzeCoOccurrence();

  console.log('Part C.3: block position...');
  const blockPosition = analyzeBlockPosition();

  console.log('Part C.4: rep ranges...');
  const repRanges = analyzeRepRanges();

  const results = { oldBlocks, newBlocks, levelPlacement, coOccurrence, blockPosition, repRanges };
  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`Wrote ${OUT_PATH}`);

  console.log('\n=== SUMMARY ===');
  console.log('OLD block categories:', oldBlocks.byCategory);
  console.log('OLD target-blocks-by-duration:', oldBlocks.targetBlocksByDuration);
  console.log('NEW block categories (totals):', newBlocks.byCategoryTotals);
  console.log('NEW block labels:', Object.entries(newBlocks.byLabel).map(([k, v]) => `${k}: ${v.n} (${v.pct}%)`));
  console.log('NEW target-blocks-by-duration:', newBlocks.targetBlocksByDuration);
  console.log('NEW % runs with pairing:', newBlocks.pctRunsWithPairing, 'vs OLD:', oldBlocks.pctWorkoutsWithPaired);
  console.log('Level placement: comparable=', levelPlacement.comparable, '/', levelPlacement.totalBridged);
  console.log('Co-occurrence: old workouts=', coOccurrence.oldTotalWorkouts, 'new runs=', coOccurrence.newTotalRuns);
  console.log('Block position: comparable=', blockPosition.comparable, 'flagged=', blockPosition.flagged.length);
  console.log('Rep ranges: comparable=', repRanges.comparable, '2x+=', repRanges.twoXPlusCount);
}

main();
