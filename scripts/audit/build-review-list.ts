/**
 * scripts/audit/build-review-list.ts — READ ONLY. Reads only snapshot.sqlite
 * (already built by build-snapshot.ts, post the isTimeBased fixes this
 * session). No Firestore, no writes anywhere else. Part 3 of the
 * time-vs-reps task: a single, severity-ranked table of exercises flagged
 * by STRUCTURAL signals alone (tier/level/hold/corpus-deviation) — no
 * domain knowledge of the exercises themselves, matching the task's own
 * framing ("בלי להכיר את התרגילים").
 *
 * `tier` isn't a captured column in workout_exercises — it's re-derived
 * from `level_diff` (already captured, = WorkoutExercise.levelDelta) via
 * the EXACT same resolveTier() formula (workout-generator.types.ts:65-71):
 *   delta>=2 → elite | ===1 → hard | ===0 → match | >=-2 → easy | else → flow
 * A pure, deterministic re-derivation, not an approximation with drift risk.
 *
 * Criterion 4 (corpus deviation) needs the old corpus split by time-vs-reps
 * too, but the legacy schema has no such flag — the NEW side's (now-fixed)
 * is_time_based is used to decide how to interpret the SAME bridged
 * exercise's old min/max (seconds vs reps), which is exactly the split the
 * task says was missing before this session's fix.
 *
 * Run:  npx tsx scripts/audit/build-review-list.ts
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SNAPSHOT_DB_PATH = path.join(REPO_ROOT, 'scripts', 'audit', 'snapshot.sqlite');
const OUT_MD_PATH = path.join(REPO_ROOT, 'docs', 'workout-engine', '06-TIME-VS-REPS.md');

const db = new Database(SNAPSHOT_DB_PATH, { readonly: true });

type TierName = 'elite' | 'hard' | 'match' | 'easy' | 'flow';
function resolveTier(levelDelta: number): TierName {
  if (levelDelta >= 2) return 'elite';
  if (levelDelta === 1) return 'hard';
  if (levelDelta === 0) return 'match';
  if (levelDelta >= -2) return 'easy';
  return 'flow';
}

interface Flag { code: string; label: string; severity: number; detail: string; }
interface Row {
  exercise_id: string; name: string; resolved_level: number | null;
  sets: number; reps: number; is_time_based: number; level_diff: number | null;
  flags: Flag[];
  allReps: number[]; allTimeBased: number[];
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function main() {
  const rows = db.prepare(`
    SELECT exercise_id, name, resolved_level, sets, reps, is_time_based, level_diff
    FROM workout_exercises
    WHERE (exercise_role = 'main' OR exercise_role IS NULL)
      AND paired_with IS NULL AND protocol_block IS NULL AND pyramid_sequence IS NULL
      AND reps IS NOT NULL
  `).all() as { exercise_id: string; name: string; resolved_level: number | null; sets: number; reps: number; is_time_based: number; level_diff: number | null }[];

  console.log(`Scanning ${rows.length} main-slot occurrences...`);

  const byExercise = new Map<string, Row>();
  // Per-exercise occurrence counters for C1/C2/C3, keyed by exercise_id, so
  // each criterion is reported ONCE per exercise with an occurrence count —
  // not once per row (an exercise can appear hundreds of times across the
  // matrix; repeating the same flag text per occurrence made the first draft
  // of this table unreadable).
  const c1Counts = new Map<string, { tier: TierName; reps: number; n: number }>();
  const c2Counts = new Map<string, { level: number; reps: number; n: number }>();
  const c3Counts = new Map<string, { level: number; hold: number; n: number }>();
  const c1 = { elite_hard_high: 0, easy_flow_low: 0 };
  let c2 = 0, c3 = 0;

  for (const r of rows) {
    if (!byExercise.has(r.exercise_id)) {
      byExercise.set(r.exercise_id, {
        exercise_id: r.exercise_id, name: r.name, resolved_level: r.resolved_level,
        sets: r.sets, reps: r.reps, is_time_based: r.is_time_based, level_diff: r.level_diff,
        flags: [], allReps: [], allTimeBased: [],
      });
    }
    const agg = byExercise.get(r.exercise_id)!;
    agg.allReps.push(r.reps);
    agg.allTimeBased.push(r.is_time_based);

    // ── Criterion 1: tier vs actual rep range (reps-based only) ──────────
    if (r.is_time_based === 0 && r.level_diff !== null) {
      const tier = resolveTier(r.level_diff);
      if ((tier === 'elite' || tier === 'hard') && r.reps >= 6) {
        const cur = c1Counts.get(r.exercise_id) ?? { tier, reps: r.reps, n: 0 };
        cur.n++; c1Counts.set(r.exercise_id, cur);
        c1.elite_hard_high++;
      } else if ((tier === 'easy' || tier === 'flow') && r.reps >= 1 && r.reps <= 3) {
        const cur = c1Counts.get(r.exercise_id) ?? { tier, reps: r.reps, n: 0 };
        cur.n++; c1Counts.set(r.exercise_id, cur);
        c1.easy_flow_low++;
      }
    }

    // ── Criterion 2: level vs reps ────────────────────────────────────────
    if (r.is_time_based === 0 && r.resolved_level !== null && r.resolved_level >= 12 && r.reps >= 8) {
      const cur = c2Counts.get(r.exercise_id) ?? { level: r.resolved_level, reps: r.reps, n: 0 };
      cur.n++; c2Counts.set(r.exercise_id, cur);
      c2++;
    }

    // ── Criterion 3: level vs hold ────────────────────────────────────────
    if (r.is_time_based === 1 && r.resolved_level !== null && r.resolved_level >= 15 && r.reps >= 20) {
      const cur = c3Counts.get(r.exercise_id) ?? { level: r.resolved_level, hold: r.reps, n: 0 };
      cur.n++; c3Counts.set(r.exercise_id, cur);
      c3++;
    }
  }

  for (const [id, c] of Array.from(c1Counts)) {
    const agg = byExercise.get(id)!;
    const expected = c.tier === 'elite' || c.tier === 'hard' ? '1-3' : '10-15';
    agg.flags.push({ code: 'C1', label: `tier=${c.tier} עקבי (${c.n}/${agg.allReps.length} מופעים) עם ~${c.reps} חזרות — צפוי ${expected}`, severity: 2, detail: '' });
  }
  for (const [id, c] of Array.from(c2Counts)) {
    const agg = byExercise.get(id)!;
    agg.flags.push({ code: 'C2', label: `רמה ${c.level} עם ${c.reps} חזרות (${c.n} מופעים)`, severity: 3, detail: '' });
  }
  for (const [id, c] of Array.from(c3Counts)) {
    const agg = byExercise.get(id)!;
    agg.flags.push({ code: 'C3', label: `רמה ${c.level} עם החזקת ${c.hold} שניות (${c.n} מופעים)`, severity: 3, detail: '' });
  }
  console.log(`C1 (tier vs reps): elite/hard-too-high=${c1.elite_hard_high}, easy/flow-too-low=${c1.easy_flow_low}`);
  console.log(`C2 (level>=12 + reps>=8): ${c2} occurrences`);
  console.log(`C3 (level>=15 + hold>=20s): ${c3} occurrences`);

  // ── Criterion 4: corpus deviation, bridged exercises only, split by is_time_based ──
  const bridged = db.prepare(`SELECT new_id, new_name, old_id, old_name FROM exercise_bridge WHERE match_type != 'none'`).all() as
    { new_id: string; new_name: string; old_id: number; old_name: string }[];

  const oldRangeStmt = db.prepare(`
    SELECT se.min AS mn, se.max AS mx
    FROM legacy_set_exercises se
    JOIN legacy_workout_sets ws ON se.setid = ws.id
    JOIN legacy_workouts w ON ws.workoutid = w.id
    WHERE se.exerciseid = ? AND w.targetid IN (13,14,15,16,17,18) AND w.active = 1
      AND se.min IS NOT NULL AND se.max IS NOT NULL AND se.max > 0
  `);
  const newValsStmt = db.prepare(`SELECT reps, is_time_based FROM workout_exercises WHERE exercise_id = ? AND reps IS NOT NULL AND (exercise_role='main' OR exercise_role IS NULL)`);

  let c4 = 0;
  for (const b of bridged) {
    const newVals = newValsStmt.all(b.new_id) as { reps: number; is_time_based: number }[];
    if (newVals.length === 0) continue;
    // Trust the (now-fixed) new-side classification for this exercise —
    // majority vote across its own occurrences, since a single exercise_id
    // should be structurally one or the other (barring the declared tabata
    // exception, which this query doesn't restrict against but is rare
    // enough not to flip a majority vote).
    const timeVotes = newVals.filter((v) => v.is_time_based === 1).length;
    const isTimeBased = timeVotes > newVals.length / 2;
    const newReps = newVals.filter((v) => !!v.is_time_based === isTimeBased).map((v) => v.reps);
    if (newReps.length === 0) continue;
    const newMedian = median(newReps);

    const oldRanges = oldRangeStmt.all(b.old_id) as { mn: number; mx: number }[];
    if (oldRanges.length === 0) continue;
    const oldMidpoint = median(oldRanges.map((r) => (r.mn + r.mx) / 2));
    if (oldMidpoint <= 0 || newMedian <= 0) continue;

    const ratio = Math.max(newMedian / oldMidpoint, oldMidpoint / newMedian);
    if (ratio >= 2) {
      const agg = byExercise.get(b.new_id);
      if (agg) {
        const unit = isTimeBased ? 'שניות' : 'חזרות';
        agg.flags.push({
          code: 'C4',
          label: `סטייה מהקורפוס: דוד ${Math.round(oldMidpoint)} ${unit} (חציון), המחולל ${Math.round(newMedian)} (פי ${ratio.toFixed(1)})`,
          severity: 4,
          detail: `old_midpoint=${oldMidpoint.toFixed(1)}, new_median=${newMedian}, ratio=${ratio.toFixed(2)}, unit=${unit}`,
        });
        c4++;
      }
    }
  }
  console.log(`C4 (corpus deviation 2x+, bridged only): ${c4} exercises`);

  // ── Rank + emit ──────────────────────────────────────────────────────────
  const flagged = Array.from(byExercise.values()).filter((r) => r.flags.length > 0);
  for (const r of flagged) {
    (r as any)._score = r.flags.reduce((s, f) => s + f.severity, 0);
  }
  flagged.sort((a, b) => (b as any)._score - (a as any)._score);
  const top40 = flagged.slice(0, 40);
  console.log(`Total flagged exercises: ${flagged.length}. Showing top ${top40.length}.`);

  const esc = (s: string) => s.replace(/\|/g, '\\|');
  const header = `| שם | רמה | מה המחולל נותן (חציון) | מה הצפוי (למה סומן) | חומרה |\n|---|---|---|---|---|`;
  const rowsMd = top40.map((r) => {
    const timeVotes = r.allTimeBased.filter((v) => v === 1).length;
    const isTimeBasedMajority = timeVotes > r.allTimeBased.length / 2;
    const medianReps = median(r.allReps);
    const given = isTimeBasedMajority ? `${medianReps} שניות × ${r.sets} סטים` : `${medianReps} חזרות × ${r.sets} סטים`;
    const flagsText = r.flags.map((f) => f.label).join(' | ');
    return `| ${esc(r.name)} | ${r.resolved_level ?? '—'} | ${given} | ${esc(flagsText)} | ${(r as any)._score} |`;
  });

  const section = `

---

## Part 3 — רשימה מדורגת לסקירה ידנית (עד 40 שורות)

*חשוד לפי סימנים מבנים בלבד — בלי היכרות עם התרגילים עצמם. כל שורה יכולה לצבור
כמה דגלים (החומרה מסוכמת). דגלים: **C1** = tier מול טווח חזרות בפועל (TIER_TABLE)
— elite/hard עם 6+ חזרות (צפוי 1-3) או easy/flow עם 1-3 (צפוי 10-15). **C2** =
רמה 12+ עם 8+ חזרות. **C3** = רמה 15+ עם החזקה 20+ שניות. **C4** = על 189
התרגילים המגושרים בלבד, אחרי פילוח נכון לזמן-מול-חזרות (התיקון מחלק 1) — פער
פי 2+ מהחציון שדוד נתן לאותו תרגיל.*

**סיכום כמותי לפני הדירוג:** C1 (tier/reps) — ${c1.elite_hard_high} elite/hard
עם חזרות גבוהות מדי, ${c1.easy_flow_low} easy/flow עם חזרות נמוכות מדי. C2
(רמה/חזרות) — ${c2} מופעים. C3 (רמה/החזקה) — ${c3} מופעים. C4 (סטיית קורפוס) —
${c4} תרגילים (מתוך 189 המגושרים).

${header}
${rowsMd.join('\n')}
`;

  let existing = fs.readFileSync(OUT_MD_PATH, 'utf-8');
  const marker = '\n---\n\n## Part 3';
  const idx = existing.indexOf(marker);
  if (idx >= 0) existing = existing.slice(0, idx);
  fs.writeFileSync(OUT_MD_PATH, existing + section, 'utf-8');
  console.log(`Appended Part 3 to ${OUT_MD_PATH}`);
}

main();
