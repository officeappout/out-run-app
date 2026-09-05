/**
 * scripts/audit/build-session-volume.ts — READ ONLY. Reads only snapshot.sqlite
 * (already built by build-exercise-bridge.ts + build-snapshot.ts) and
 * exercise-inventory.csv (for movementGroup, to derive domain). No Firestore,
 * no writes anywhere else.
 *
 * Adds two tables to snapshot.sqlite:
 *   session_volume(run_id, domain, exercises_count, working_sets, total_reps,
 *                   est_time_under_tension)          — new generator
 *   legacy_session_volume(workout_id, domain, exercises_count, working_sets,
 *                   total_reps, est_time_under_tension) — old corpus, same cut
 *
 * Why this exists: per docs/workout-engine/05-BENCHMARK.md's own findings,
 * exercise COUNT and block SHAPE were the axes measured — but training-volume
 * research (Kassiano 2024, Remmert 2025, cited in the task) says what
 * actually drives outcome is WORKING SETS PER MUSCLE GROUP, not exercise
 * variety. This computes that metric directly so the real question — does
 * the generator give as many sets/muscle-group as David did, at the same
 * duration/level — can be answered.
 *
 * ── Scope: only bridged exercises (same restriction as 05-BENCHMARK.md §4) ─
 * `domain` for an OLD exercise is only knowable by looking up what it maps
 * to in the NEW catalog (old exercises have no movementGroup field at all).
 * So legacy_session_volume necessarily covers only the ~189 bridged
 * exercises' occurrences — NOT the full old corpus. This is a real, stated
 * scope limitation, not silently ignored: an old block's exercises that
 * aren't bridged are excluded from legacy_session_volume entirely (not
 * counted as domain=null or dropped silently mid-aggregation).
 *
 * ── working_sets formula (old side, exactly as specified) ────────────────
 * "working_sets = repeats of the block × number of exercises in it" — for
 * each legacy_set_exercises row (excluding exerciseid=0, which is a
 * rest-timer placeholder, not an exercise — see build-exercise-bridge.ts's
 * commit / 05-BENCHMARK.md's methodology note), its contribution to
 * working_sets is exactly `repeats` (the parent block's round count) — summed
 * across all such rows in a (workout, domain) group. Summing per-row
 * `repeats` is mathematically identical to summing `repeats × n_exercises`
 * per block, since a paired/superset block contributes `repeats` once per
 * exercise row (n_exercises rows), which is the new-generator convention too
 * (each exercise in a superset independently carries its own `sets` value).
 *
 * ── total_reps / est_time_under_tension — best-effort, documented ────────
 * New side: total_reps = SUM(sets × reps) for rep-based exercises only.
 * est_time_under_tension = SUM(sets × reps × 3s) for rep-based (3s/rep is
 * the exact default normalizeExercise uses for secondsPerRep when a real
 * per-exercise value is absent — exercise-mapping.utils.ts) + SUM(sets ×
 * reps) directly in seconds for time-based (reps stores the hold-seconds
 * value for those, per the codebase's own convention).
 * Old side: same 3s/rep assumption, using the min-max midpoint as the rep
 * count per set. CAVEAT, stated plainly: the old schema has no is_time_based
 * flag, so a real hold exercise (its min/max are seconds, not reps — e.g.
 * "פלאנק" min=10,max=45) gets treated as if the value were reps, inflating
 * its estimated TUT via the ×3s multiplier it shouldn't receive. This
 * biases est_time_under_tension upward for old on hold-heavy domains
 * (mainly core) — flagged in 05-BENCHMARK.md, not silently absorbed into
 * the headline number. working_sets (the primary metric this task cares
 * about) has no such ambiguity and is not affected.
 *
 * Run:  npx tsx scripts/audit/build-session-volume.ts
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { MG_TO_DOMAIN } from '../../src/features/workout-engine/shared/constants/domain-mapping.constants';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SNAPSHOT_DB_PATH = path.join(REPO_ROOT, 'scripts', 'audit', 'snapshot.sqlite');
const CSV_PATH = path.join(REPO_ROOT, 'exercise-inventory.csv');

const SECONDS_PER_REP_DEFAULT = 3;

// ============================================================================
// CSV parsing (same minimal parser as build-exercise-bridge.ts)
// ============================================================================

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++; continue;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function loadNewIdToDomain(): Map<string, string> {
  const text = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(text);
  const header = rows[0];
  const idIdx = header.indexOf('id');
  const mgIdx = header.indexOf('movementGroup');
  const map = new Map<string, string>();
  for (const r of rows.slice(1)) {
    const id = r[idIdx];
    const mg = r[mgIdx];
    if (mg && MG_TO_DOMAIN[mg]) map.set(id, MG_TO_DOMAIN[mg]);
  }
  return map;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const db = new Database(SNAPSHOT_DB_PATH);
  const newIdToDomain = loadNewIdToDomain();
  console.log(`Loaded domain for ${newIdToDomain.size} new-catalog exercises from CSV.`);

  // ── NEW side: session_volume ──────────────────────────────────────────
  // Main-role only (warmup/cooldown are not "working sets" in the volume
  // sense this task is asking about), excluding pyramid/tabata/pairs' own
  // structural rows are still counted — a superset's two exercises each
  // carry their own `sets`, contributing independently, matching the old
  // formula's per-row semantics.
  //
  // ── working_sets normalization for block-shaped rows (docs/workout-engine/
  // 09-CORE-TABATA.md §5, David's decision: sets-equivalent) ────────────────
  // A protocol_block='tabata' member or an isFollowAlong exercise doesn't
  // carry a meaningful literal `sets` — a tabata member is hardcoded sets:1
  // regardless of how many of the block's 8 intervals it's actually visited
  // (2/4/8-member composition, docs/workout-engine/09-CORE-TABATA.md §1.3);
  // a follow-along item is one continuous clip with no set structure at all.
  // Counting these at their literal `sets` value undercounts real effort
  // (measured: a 2-member tabata block member is visited 4× across the 8
  // rounds — 80s of real work — but sets:1 only ever credited 20s) and, for
  // follow-along specifically, produces working_sets:1 vs form A's 2-3 for a
  // COMPARABLE amount of core work (09-CORE-TABATA.md §4's own volume-
  // accounting risk section).
  //
  // Chosen normalization: derive a sets-equivalent from est_time_under_
  // tension instead of trusting the literal `sets` field for these rows.
  // SECONDS_PER_SET_EQUIVALENT=20 is a round number close to a typical form-A
  // set (TIER_TABLE match tier's reps range, ~3-6 reps × SECONDS_PER_REP_
  // DEFAULT=3s ≈ 9-18s; skewed slightly up rather than down since core sets
  // often run longer holds). Not derived from a live measurement — a
  // documented, auditable choice, easy to recompute by hand if revisited.
  const SECONDS_PER_SET_EQUIVALENT = 20;

  db.exec(`DROP TABLE IF EXISTS session_volume`);
  db.exec(`
    CREATE TABLE session_volume (
      run_id TEXT, domain TEXT, exercises_count INTEGER,
      working_sets INTEGER, total_reps INTEGER, est_time_under_tension INTEGER
    )
  `);

  const newRows = db.prepare(`
    SELECT run_id, domain, exercise_id, sets, reps, is_time_based, protocol_block, is_follow_along
    FROM workout_exercises
    WHERE (exercise_role = 'main' OR exercise_role IS NULL) AND domain IS NOT NULL
  `).all() as { run_id: string; domain: string; exercise_id: string; sets: number; reps: number | null; is_time_based: number; protocol_block: string | null; is_follow_along: number | null }[];

  type Agg = { exercises: Set<string>; workingSets: number; totalReps: number; tut: number };
  const newAgg = new Map<string, Agg>();
  for (const r of newRows) {
    const key = `${r.run_id}|${r.domain}`;
    if (!newAgg.has(key)) newAgg.set(key, { exercises: new Set(), workingSets: 0, totalReps: 0, tut: 0 });
    const agg = newAgg.get(key)!;
    agg.exercises.add(r.exercise_id);

    const isBlockShaped = r.protocol_block === 'tabata' || r.is_follow_along === 1;
    let rowTut = 0;
    if (r.reps != null) {
      if (r.is_time_based) {
        rowTut = (r.sets ?? 0) * r.reps; // reps IS the hold-seconds value
      } else {
        agg.totalReps += (r.sets ?? 0) * r.reps;
        rowTut = (r.sets ?? 0) * r.reps * SECONDS_PER_REP_DEFAULT;
      }
    }
    agg.tut += rowTut;
    agg.workingSets += isBlockShaped
      ? Math.round(rowTut / SECONDS_PER_SET_EQUIVALENT)
      : (r.sets ?? 0);
  }

  const insertNew = db.prepare(`
    INSERT INTO session_volume (run_id, domain, exercises_count, working_sets, total_reps, est_time_under_tension)
    VALUES (@run_id, @domain, @exercises_count, @working_sets, @total_reps, @est_time_under_tension)
  `);
  const insertNewMany = db.transaction((entries: any[]) => { for (const e of entries) insertNew.run(e); });
  const newEntries = Array.from(newAgg.entries()).map(([key, agg]) => {
    const [run_id, domain] = key.split('|');
    return {
      run_id, domain, exercises_count: agg.exercises.size,
      working_sets: agg.workingSets, total_reps: agg.totalReps, est_time_under_tension: agg.tut,
    };
  });
  insertNewMany(newEntries);
  console.log(`session_volume: ${newEntries.length} (run_id, domain) rows.`);

  // ── OLD side: legacy_session_volume ───────────────────────────────────
  // Only main-equivalent blocks (target/paired/core — mirrors §3 of
  // 05-BENCHMARK.md's old-corpus categorization; excludes warmup/finisher/
  // other), only bridged exercises (see file header), excluding
  // exerciseid=0 rest-timer placeholder rows.
  db.exec(`DROP TABLE IF EXISTS legacy_session_volume`);
  db.exec(`
    CREATE TABLE legacy_session_volume (
      workout_id INTEGER, domain TEXT, exercises_count INTEGER,
      working_sets INTEGER, total_reps INTEGER, est_time_under_tension INTEGER
    )
  `);

  const oldIdToDomain = new Map<number, string>();
  const bridgeRows = db.prepare(`SELECT old_id, new_id FROM exercise_bridge WHERE match_type != 'none'`).all() as { old_id: number; new_id: string }[];
  for (const b of bridgeRows) {
    const domain = newIdToDomain.get(b.new_id);
    if (domain) oldIdToDomain.set(b.old_id, domain);
  }
  console.log(`Resolved domain for ${oldIdToDomain.size} bridged old-catalog exercise ids.`);

  const oldRows = db.prepare(`
    SELECT w.id AS workout_id, se.exerciseid AS old_id, ws.repeats, se.min, se.max
    FROM legacy_set_exercises se
    JOIN legacy_workout_sets ws ON se.setid = ws.id
    JOIN legacy_workouts w ON ws.workoutid = w.id
    WHERE w.targetid IN (13,14,15,16,17,18) AND w.active = 1
      AND se.exerciseid != 0
      AND (
        ws.title LIKE 'יעד%' OR ws.title LIKE 'סופר סט%'
        OR ws.title = 'ליבה' OR ws.title LIKE 'חיזוק ליבה%' OR ws.title LIKE 'חיזוק בטן%'
      )
  `).all() as { workout_id: number; old_id: number; repeats: number; min: number | null; max: number | null }[];

  const oldAgg = new Map<string, Agg>();
  let unbridgedSkipped = 0;
  for (const r of oldRows) {
    const domain = oldIdToDomain.get(r.old_id);
    if (!domain) { unbridgedSkipped++; continue; }
    const key = `${r.workout_id}|${domain}`;
    if (!oldAgg.has(key)) oldAgg.set(key, { exercises: new Set(), workingSets: 0, totalReps: 0, tut: 0 });
    const agg = oldAgg.get(key)!;
    agg.exercises.add(String(r.old_id));
    agg.workingSets += r.repeats; // see file header: repeats-per-row = repeats-per-block-exercise
    if (r.min != null && r.max != null && r.max > 0) {
      const midpoint = (r.min + r.max) / 2;
      agg.totalReps += r.repeats * midpoint;
      agg.tut += r.repeats * midpoint * SECONDS_PER_REP_DEFAULT; // see file header caveat re: hold exercises
    }
  }

  const insertOld = db.prepare(`
    INSERT INTO legacy_session_volume (workout_id, domain, exercises_count, working_sets, total_reps, est_time_under_tension)
    VALUES (@workout_id, @domain, @exercises_count, @working_sets, @total_reps, @est_time_under_tension)
  `);
  const insertOldMany = db.transaction((entries: any[]) => { for (const e of entries) insertOld.run(e); });
  const oldEntries = Array.from(oldAgg.entries()).map(([key, agg]) => {
    const [workout_id, domain] = key.split('|');
    return {
      workout_id: Number(workout_id), domain, exercises_count: agg.exercises.size,
      working_sets: Math.round(agg.workingSets), total_reps: Math.round(agg.totalReps), est_time_under_tension: Math.round(agg.tut),
    };
  });
  insertOldMany(oldEntries);
  console.log(`legacy_session_volume: ${oldEntries.length} (workout_id, domain) rows. ${unbridgedSkipped} old set_exercises rows skipped (not bridged).`);

  db.close();
}

main();
