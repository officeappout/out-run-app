/**
 * scripts/audit/report-by-bolt.ts — the standing reporting tool for
 * snapshot.sqlite (built by build-snapshot.ts), per David's 06.09.2026
 * instruction: "מעכשיו כל דיווח מספרי מפוצל לפי בולט 1/2/3, לא ממוצע משולב."
 *
 * Bolt 1/2/3 are NOT interchangeable samples of "a 45-minute workout" — bolt
 * 1 (flow_regression) is *designed* to be shorter/easier, bolt 2 (standard)
 * targets the requested duration, bolt 3 (intense/pyramid) targets it at
 * higher difficulty. Pooling all 3 into one average (as every report before
 * this one did) mixes a deliberately-short option into a "duration gap"
 * number, making it look worse (or the fix look smaller) than it is for the
 * bolt that's actually supposed to hit the target. `workouts.bolt` was
 * already captured in the schema from the very first build-snapshot.ts
 * version — this script is the fix: report by bolt, not the column.
 *
 * Run: npx tsx scripts/audit/report-by-bolt.ts [path-to-snapshot.sqlite]
 */

import Database from 'better-sqlite3';
import * as path from 'path';

const DB_PATH = process.argv[2] ?? path.join(__dirname, 'snapshot.sqlite');
const db = new Database(DB_PATH, { readonly: true });

function printTable(title: string, rows: any[]) {
  console.log(`\n=== ${title} ===`);
  if (rows.length === 0) { console.log('(no rows)'); return; }
  console.table(rows);
}

// ── (a) exercise count by bolt x duration ──────────────────────────────────
printTable(
  'Exercise count by bolt x duration',
  db.prepare(`
    SELECT w.bolt, w.req_duration,
           COUNT(DISTINCT w.run_id) AS n,
           ROUND(AVG(mc.main_count), 2) AS avg_main,
           MIN(mc.main_count) AS min_main, MAX(mc.main_count) AS max_main
    FROM workouts w
    JOIN (
      SELECT run_id, COUNT(*) AS main_count
      FROM workout_exercises WHERE exercise_role = 'main'
      GROUP BY run_id
    ) mc ON mc.run_id = w.run_id
    GROUP BY w.bolt, w.req_duration
    ORDER BY w.req_duration, w.bolt
  `).all(),
);

// ── (b) duration gap by bolt x duration ────────────────────────────────────
printTable(
  'Duration gap by bolt x duration',
  db.prepare(`
    SELECT bolt, req_duration, COUNT(*) AS n,
           ROUND(AVG(estimated_duration), 2) AS avg_estimated,
           ROUND(AVG(estimated_duration - req_duration), 2) AS avg_gap,
           MIN(estimated_duration - req_duration) AS worst_gap,
           MAX(estimated_duration - req_duration) AS best_gap
    FROM workouts
    GROUP BY bolt, req_duration
    ORDER BY req_duration, bolt
  `).all(),
);

// ── (c) % with core by bolt x duration ─────────────────────────────────────
printTable(
  '% workouts with core, by bolt x duration',
  db.prepare(`
    SELECT w.bolt, w.req_duration,
           COUNT(DISTINCT w.run_id) AS n,
           ROUND(100.0 * COUNT(DISTINCT CASE WHEN we.domain = 'core' THEN w.run_id END) / COUNT(DISTINCT w.run_id), 1) AS pct_with_core
    FROM workouts w
    LEFT JOIN workout_exercises we ON we.run_id = w.run_id AND we.exercise_role = 'main'
    GROUP BY w.bolt, w.req_duration
    ORDER BY w.req_duration, w.bolt
  `).all(),
);

// ── (d) domain-completeness by bolt x duration — the tracked headline metric ─
printTable(
  'Domain-completeness (of 4: push/pull/legs/core) by bolt x duration',
  db.prepare(`
    WITH domain_presence AS (
      SELECT w.run_id, w.bolt, w.req_duration,
        MAX(CASE WHEN we.domain = 'push' THEN 1 ELSE 0 END) AS has_push,
        MAX(CASE WHEN we.domain = 'pull' THEN 1 ELSE 0 END) AS has_pull,
        MAX(CASE WHEN we.domain = 'legs' THEN 1 ELSE 0 END) AS has_legs,
        MAX(CASE WHEN we.domain = 'core' THEN 1 ELSE 0 END) AS has_core
      FROM workouts w
      LEFT JOIN workout_exercises we ON we.run_id = w.run_id AND we.exercise_role = 'main'
      GROUP BY w.run_id, w.bolt, w.req_duration
    )
    SELECT bolt, req_duration, COUNT(*) AS n,
           ROUND(AVG(has_push + has_pull + has_legs + has_core), 2) AS avg_domains_present,
           ROUND(100.0 * SUM(CASE WHEN (has_push + has_pull + has_legs + has_core) < 4 THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_missing_any_domain
    FROM domain_presence
    GROUP BY bolt, req_duration
    ORDER BY req_duration, bolt
  `).all(),
);

db.close();
