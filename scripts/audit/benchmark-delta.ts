/**
 * scripts/audit/benchmark-delta.ts — READ ONLY. Compares several snapshot.sqlite
 * builds (05-BENCHMARK.md's metrics) side by side and prints the Hebrew delta tables
 * used in 05-BENCHMARK.md's dated sections. No Firestore, no network.
 *
 * Usage:
 *   npx tsx scripts/audit/benchmark-delta.ts label=path/to/snapshot.sqlite[,path/to/benchmark-results.json] ... [--json out.json]
 *
 * Each snapshot must already carry session_volume / legacy_session_volume
 * (build-session-volume.ts). The optional benchmark-results.json (analyze-benchmark.ts)
 * adds the block-shape metrics (pairing %, block labels).
 *
 * Only main exercises (exerciseRole not warmup/cooldown) count for the per-exercise
 * metrics, matching 05-BENCHMARK.md §3 / §5.
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';

type Metrics = Record<string, number | string | null>;

const MAIN = `exercise_role NOT IN ('warmup','cooldown')`;
const r1 = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? null : Math.round(n * 100) / 100);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

function metricsFor(dbPath: string, benchPath?: string): Metrics {
  const db = new Database(dbPath, { readonly: true });
  const one = <T = any>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T;
  const all = <T = any>(sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as T[];
  const hasCol = (t: string, c: string) => all<{ name: string }>(`PRAGMA table_info(${t})`).some(r => r.name === c);
  const m: Metrics = {};
  const nW = one<{ n: number }>(`SELECT COUNT(*) n FROM workouts`).n;
  m.workouts = nW;
  m.exercises = one<{ n: number }>(`SELECT COUNT(*) n FROM workout_exercises`).n;
  m.main_per_workout = r1(one<{ n: number }>(`SELECT COUNT(*)*1.0/${nW} n FROM workout_exercises WHERE ${MAIN}`).n);
  for (const d of [15, 20, 30, 45]) {
    const row = one<{ n: number }>(`SELECT AVG(c) n FROM (SELECT w.run_id, (SELECT COUNT(*) FROM workout_exercises e WHERE e.run_id=w.run_id AND e.${MAIN}) c FROM workouts w WHERE w.req_duration=?)`, d);
    m[`main_per_workout_${d}`] = r1(row?.n);
  }
  const zero = one<{ n: number }>(`SELECT COUNT(*) n FROM workouts w WHERE (SELECT COUNT(*) FROM workout_exercises e WHERE e.run_id=w.run_id AND e.${MAIN})=0`).n;
  m.pct_workouts_zero_main = pct(zero, nW);
  const le2 = one<{ n: number }>(`SELECT COUNT(*) n FROM workouts w WHERE (SELECT COUNT(*) FROM workout_exercises e WHERE e.run_id=w.run_id AND e.${MAIN}) BETWEEN 1 AND 2`).n;
  m.pct_workouts_1_2_main = pct(le2, nW);
  // sets / reps
  m.sets_per_main = r1(one<{ n: number }>(`SELECT AVG(sets) n FROM workout_exercises WHERE ${MAIN} AND pyramid_sequence IS NULL`).n);
  const repRows = all<{ reps: number }>(`SELECT reps FROM workout_exercises WHERE ${MAIN} AND is_time_based=0 AND reps>0 ORDER BY reps`);
  m.median_reps = repRows.length ? repRows[Math.floor(repRows.length / 2)].reps : null;
  const holdRows = all<{ reps: number }>(`SELECT reps FROM workout_exercises WHERE ${MAIN} AND is_time_based=1 AND reps>0 ORDER BY reps`);
  m.median_hold_sec = holdRows.length ? holdRows[Math.floor(holdRows.length / 2)].reps : null;
  const nMain = one<{ n: number }>(`SELECT COUNT(*) n FROM workout_exercises WHERE ${MAIN}`).n;
  m.pct_time_based = pct(one<{ n: number }>(`SELECT COUNT(*) n FROM workout_exercises WHERE ${MAIN} AND is_time_based=1`).n, nMain);
  m.median_rest_sec = (() => { const r = all<{ v: number }>(`SELECT rest_seconds v FROM workout_exercises WHERE ${MAIN} AND rest_seconds IS NOT NULL ORDER BY v`); return r.length ? r[Math.floor(r.length / 2)].v : null; })();
  // duration fidelity
  m.est_over_request_pct = pct(one<{ n: number }>(`SELECT COUNT(*) n FROM workouts WHERE estimated_duration > req_duration + 3`).n, nW);
  m.est_under_80pct_pct = pct(one<{ n: number }>(`SELECT COUNT(*) n FROM workouts WHERE estimated_duration < 0.8*req_duration`).n, nW);
  m.est_ratio_mean = r1(one<{ n: number }>(`SELECT AVG(estimated_duration*1.0/req_duration) n FROM workouts WHERE req_duration>0`).n);
  // core compliance: main core exercises at exactly 2 sets (non-pyramid) — §3.3
  const core = one<{ n: number; ok: number }>(`SELECT COUNT(*) n, SUM(sets=2) ok FROM workout_exercises WHERE ${MAIN} AND domain='core' AND pyramid_sequence IS NULL`);
  m.core_2sets_pct = pct(core.ok ?? 0, core.n);
  m.core_blocks = core.n;
  // core_promise_outcome was added to the snapshot schema after 2026-09-04
  const cp = hasCol('workouts', 'core_promise_outcome') ? all<{ o: string | null; n: number }>(`SELECT core_promise_outcome o, COUNT(*) n FROM workouts GROUP BY 1`) : [];
  const cpTot = cp.filter(r => r.o).reduce((s, r) => s + r.n, 0);
  for (const o of ['satisfied', 'replaced', 'injected', 'failed']) m[`core_promise_${o}_pct`] = cpTot ? pct(cp.find(r => r.o === o)?.n ?? 0, cpTot) : null;
  // core-only requests that delivered only core
  const coreReq = all<{ run_id: string }>(`SELECT run_id FROM workouts WHERE req_domains='core'`);
  if (coreReq.length) {
    const offArea = coreReq.filter(w => (one<{ n: number }>(`SELECT COUNT(*) n FROM workout_exercises WHERE run_id=? AND ${MAIN} AND domain!='core'`, w.run_id).n) > 0).length;
    m.core_request_offarea_pct = pct(offArea, coreReq.length);
  }
  // level band
  const lv = one<{ n: number; hi: number; lo: number }>(`SELECT COUNT(*) n, SUM(level_diff>3) hi, SUM(level_diff<-3) lo FROM workout_exercises WHERE ${MAIN} AND level_diff IS NOT NULL`);
  m.level_above_plus3_pct = pct(lv.hi ?? 0, lv.n);
  m.level_below_minus3_pct = pct(lv.lo ?? 0, lv.n);
  // protocols
  const protos = all<{ p: string | null; n: number }>(`SELECT applied_protocol p, COUNT(*) n FROM workouts GROUP BY 1`);
  for (const p of ['pyramid', 'antagonist_pair', 'superset', 'tabata', 'emom', 'amrap']) m[`protocol_${p}_pct`] = pct(protos.find(r => r.p === p)?.n ?? 0, nW);
  m.paired_runs_pct = pct(one<{ n: number }>(`SELECT COUNT(DISTINCT run_id) n FROM workout_exercises WHERE paired_with IS NOT NULL OR superset_type IS NOT NULL`).n, nW);
  // structure
  m.warmup_present_pct = pct(one<{ n: number }>(`SELECT COUNT(DISTINCT run_id) n FROM workout_exercises WHERE exercise_role='warmup'`).n, nW);
  m.cooldown_present_pct = pct(one<{ n: number }>(`SELECT COUNT(DISTINCT run_id) n FROM workout_exercises WHERE exercise_role='cooldown'`).n, nW);
  // session volume (working sets per domain, avg per run where the domain appears) — §5.1 / §5.2
  for (const d of ['push', 'pull', 'legs', 'core']) {
    m[`sv_${d}`] = r1(one<{ n: number }>(`SELECT AVG(working_sets) n FROM session_volume WHERE domain=?`, d)?.n);
    for (const dur of [15, 30, 45]) {
      m[`sv_${d}_${dur}`] = r1(one<{ n: number }>(`SELECT AVG(sv.working_sets) n FROM session_volume sv JOIN workouts w ON w.run_id=sv.run_id WHERE sv.domain=? AND w.req_duration=?`, d, dur)?.n);
    }
  }
  db.close();
  if (benchPath && fs.existsSync(benchPath)) {
    const b = JSON.parse(fs.readFileSync(benchPath, 'utf8'));
    m.bench_pairing_pct = b.newBlocks?.pctRunsWithPairing ?? null;
    m.bench_level_comparable = b.levelPlacement?.comparable ?? null;
    m.bench_rep_2x = b.repRanges ? `${b.repRanges.twoXPlusCount}/${b.repRanges.comparable}` : null;
    m.bench_block_pos_flagged = b.blockPosition ? `${b.blockPosition.flagged.length}/${b.blockPosition.comparable}` : null;
  }
  return m;
}

const LABELS: Record<string, string> = {
  workouts: 'אימונים ב-snapshot', exercises: 'תרגילים (כולל חימום/סיום)',
  main_per_workout: 'תרגילים ראשיים לאימון (ממוצע)',
  main_per_workout_15: '— ב-15 דק\'', main_per_workout_20: '— ב-20 דק\'', main_per_workout_30: '— ב-30 דק\'', main_per_workout_45: '— ב-45 דק\'',
  pct_workouts_zero_main: '% אימונים בלי אף תרגיל ראשי', pct_workouts_1_2_main: '% אימונים עם 1-2 תרגילים ראשיים בלבד',
  sets_per_main: 'סטים לתרגיל ראשי (ממוצע, ללא פירמידה)', median_reps: 'חציון חזרות (תרגילי חזרות)', median_hold_sec: 'חציון החזקה (שניות)',
  pct_time_based: '% תרגילי זמן', median_rest_sec: 'חציון מנוחה (שניות)',
  est_over_request_pct: '% אימונים ארוכים מהבקשה ביותר מ-3 דק\'', est_under_80pct_pct: '% אימונים קצרים מ-80% מהבקשה', est_ratio_mean: 'יחס משך מוערך/מבוקש (ממוצע)',
  core_2sets_pct: 'ליבה: % תרגילי ליבה ראשיים עם 2 סבבים בדיוק (§3.3)', core_blocks: 'ליבה: מספר תרגילי ליבה ראשיים',
  core_promise_satisfied_pct: 'הבטחת ליבה: satisfied %', core_promise_replaced_pct: 'הבטחת ליבה: replaced %', core_promise_injected_pct: 'הבטחת ליבה: injected %', core_promise_failed_pct: 'הבטחת ליבה: failed %',
  core_request_offarea_pct: 'בקשת "ליבה בלבד" (strict) שקיבלה תרגיל לא-ליבה %',
  level_above_plus3_pct: '% תרגילים ראשיים מעל רמת המשתמש +3', level_below_minus3_pct: '% תרגילים ראשיים מתחת לרמה -3',
  protocol_pyramid_pct: 'פרוטוקול פירמידה (% אימונים)', protocol_antagonist_pair_pct: 'זוג אנטגוניסטי (% אימונים)', protocol_superset_pct: 'סופרסט (% אימונים)',
  protocol_tabata_pct: 'טבאטה (% אימונים)', protocol_emom_pct: 'EMOM (% אימונים)', protocol_amrap_pct: 'AMRAP (% אימונים)',
  paired_runs_pct: '% אימונים עם עבודה מזווגת (pairedWith/supersetType)',
  warmup_present_pct: '% אימונים עם חימום', cooldown_present_pct: '% אימונים עם שחרור',
  sv_push: 'סטים עובדים push (§5.1)', sv_pull: 'סטים עובדים pull', sv_legs: 'סטים עובדים legs', sv_core: 'סטים עובדים core',
  bench_pairing_pct: 'analyze-benchmark: % ריצות עם זיווג', bench_level_comparable: 'analyze-benchmark: תרגילים מגושרים בני-השוואה ברמה',
  bench_rep_2x: 'analyze-benchmark: פער חזרות פי 2+ (מתוך בני-השוואה)', bench_block_pos_flagged: 'analyze-benchmark: חריגי מיקום בלוק',
};

function main() {
  const args = process.argv.slice(2);
  const jsonIdx = args.indexOf('--json');
  const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : undefined;
  const specs = args.filter((a, i) => a.includes('=') && i !== jsonIdx + 1);
  const cols = specs.map(s => {
    const [label, rest] = s.split('=');
    const [dbPath, benchPath] = rest.split(',');
    return { label, m: metricsFor(dbPath, benchPath) };
  });
  const keys = Array.from(new Set(cols.flatMap(c => Object.keys(c.m))));
  const lines = [`| מדד | ${cols.map(c => c.label).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`];
  for (const k of keys) lines.push(`| ${LABELS[k] ?? k} | ${cols.map(c => (c.m[k] ?? '—')).join(' | ')} |`);
  console.log(lines.join('\n'));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(Object.fromEntries(cols.map(c => [c.label, c.m])), null, 2));
}
main();
