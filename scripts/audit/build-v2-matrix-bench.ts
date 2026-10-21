/**
 * scripts/audit/build-v2-matrix-bench.ts — the enable_home_v2 QA matrix (21.10.2026).
 *
 * Strength (flag ON): tests/invariants/v2/* — day focus per split & day index, equipment ×
 * focus, PPL ×2, health_cap, beginner 5+ days, pool narrowing, complementary sets, hybrid
 * station, route + stops — graded by H1–H8 (+ soft V1–V9).
 * Week: tests/invariants/v2/week-invariants.ts over the 33 schedule-combos fixtures + the
 * recommendation-policy and walk-plan matrices (W/P/K).
 *
 * HERMETIC like build-entrypoints-bench.ts (asserted): replay of tests/invariants/hermetic/
 * corpus, fetch throws, any Firestore write fails the run. No LLM is ever called: failing
 * cells are EXPORTED (--export-review) as generation-review regression fixtures the admin
 * LLM reviewer can judge later.
 *
 * Run:  npx tsx scripts/generator-qa.ts --full     (or --ci for the subset)
 * Out:  scripts/audit/out/v2-matrix.json + .csv (+ v2-review-fixtures/*.json with --export-review)
 */
import '../../tests/invariants/hermetic/guard'; // FIRST: no real Firebase, no network
import * as fs from 'fs';
import * as path from 'path';
import { mulberry32 } from '../../tests/invariants/entry-points';
import { exName, baseDomainOf } from '../../tests/invariants/hard-invariants';
import { v2FullMatrix, v2CiMatrix, V2_GROUP_HE, type V2Group } from '../../tests/invariants/v2/v2-scenarios';
import { runV2Scenario, type V2Run } from '../../tests/invariants/v2/v2-runner';
import { gradeV2Run, runKey, ALL_HARD, SOFT_LABELS_HE } from '../../tests/invariants/v2/v2-grade';
import { V2_HARD_LABELS_HE } from '../../tests/invariants/v2/v2-invariants';
import { runWeekMatrix, WEEK_LABELS_HE } from '../../tests/invariants/v2/week-invariants';
import { exportReviewFixtures } from '../../tests/invariants/v2/v2-review-export';

const args = process.argv.slice(2);
const SEED = Number(args[args.indexOf('--seed') + 1] || 0) || 20261021;
const CI = args.includes('--ci');
const EXPORT = args.includes('--export-review');
const OUT_DIR = path.join(process.cwd(), 'scripts/audit/out');
const HARD_HE: Record<string, string> = {
  H1: 'ציוד אמיתי', H2: 'פוקוס אזור גוף', H3: 'מינימום תרגילים לזמן', H4: 'רמה ≤ משתמש+3', H5: 'בלי פריטי בדיקה', ...V2_HARD_LABELS_HE,
};

async function main() {
  const g = globalThis as Record<string, unknown>;
  if (!g.__HERMETIC_FIREBASE__ || !g.__HERMETIC_GUARD__) throw new Error('NOT hermetic — run via scripts/generator-qa.ts (tests/invariants/hermetic/tsconfig.json)');
  g.fetch = async (u: unknown) => { throw new Error(`network disabled: ${String(u).slice(0, 60)}`); };
  process.env.WORKOUT_ENGINE_FIXED_SHUFFLE_SEED = String(SEED);
  const say = process.stdout.write.bind(process.stdout);
  for (const k of ['log', 'warn', 'info', 'debug', 'group', 'groupCollapsed', 'groupEnd', 'table', 'error'] as const) (console as unknown as Record<string, unknown>)[k] = () => {};

  const scenarios = CI ? v2CiMatrix() : v2FullMatrix();
  const t0 = Date.now();
  const runs: V2Run[] = [];
  const errors: { id: string; error: string }[] = [];
  for (const s of scenarios) {
    Math.random = mulberry32(SEED);
    try { runs.push(...await runV2Scenario(s)); } catch (e) { errors.push({ id: s.id, error: String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ').slice(0, 400) }); }
  }

  const rows = runs.map((r) => {
    const { hard, soft } = gradeV2Run(r);
    const main = r.workout.exercises.filter((e) => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown');
    return {
      key: runKey(r), group: r.scenario.group, level: r.scenario.level, loc: r.scenario.loc, minutes: r.scenario.minutes,
      days: r.scenario.days.length, dayIndex: r.scenario.dayIndex, goals: r.scenario.goals.join('+'), programs: r.scenario.programs.join('+'),
      bolt: r.bolt, title: r.workout.title ?? '', main: main.length,
      exercises: main.map((e) => `${baseDomainOf(e) ?? e.exercise?.movementGroup}:${exName(e)} ${e.sets}x${e.reps}${e.isTimeBased ? 's' : ''}`).join(' | '),
      ...r.meta,
      hard: Array.from(new Set(hard.map((v): string => v.id))).sort(), soft: Array.from(new Set(soft.map((v): string => v.id))).sort(),
      evidence: [...hard, ...soft].map((v) => `${v.id}: ${v.detail}`),
      _run: r,
    };
  });

  const week = runWeekMatrix();
  const fsLog = (g.__HERMETIC_FS_LOG ?? []) as { op: string }[];
  const writes = fsLog.filter((l) => l.op.startsWith('WRITE')).length;

  // ── Summary ─────────────────────────────────────────────────────────────
  const groups = Array.from(new Set(rows.map((r) => r.group))) as V2Group[];
  const byGroup = Object.fromEntries(groups.map((grp) => {
    const rs = rows.filter((r) => r.group === grp);
    return [grp, {
      workouts: rs.length, hardFail: rs.filter((r) => r.hard.length).length, softWarn: rs.filter((r) => r.soft.length).length,
      ...Object.fromEntries(ALL_HARD.map((id) => [id, rs.filter((r) => r.hard.includes(id)).length])),
    }];
  }));
  const perHard = Object.fromEntries(ALL_HARD.map((id) => [id, rows.filter((r) => r.hard.includes(id)).length]));
  const perSoft = Object.fromEntries(Object.keys(SOFT_LABELS_HE).map((id) => [id, rows.filter((r) => r.soft.includes(id)).length]));
  const patterns = Object.fromEntries([...ALL_HARD, ...Object.keys(SOFT_LABELS_HE)].map((id) => {
    const ev = new Map<string, { n: number; example: string }>();
    for (const r of rows) for (const e of r.evidence.filter((x) => x.startsWith(`${id}:`))) {
      const k = e.replace(/\d+/g, '#').replace(/"[^"]*"/g, '"…"').slice(0, 110);
      const cur = ev.get(k); ev.set(k, { n: (cur?.n ?? 0) + 1, example: cur?.example ?? `${r.key} — ${e}` });
    }
    return [id, Array.from(ev.entries()).sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([p, v]) => ({ pattern: p, n: v.n, example: v.example }))];
  }).filter(([, v]) => (v as unknown[]).length));

  const summary = {
    generatedAt: new Date().toISOString(), mode: CI ? 'ci' : 'full', seed: SEED, scenarios: scenarios.length, workouts: rows.length,
    errors, ms: Date.now() - t0, hermetic: { firestoreReads: fsLog.filter((l) => l.op === 'read').length, blockedWrites: writes },
    perHard, perSoft, byGroup, patterns, week: week.summary,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const base = path.join(OUT_DIR, CI ? 'v2-matrix-ci' : 'v2-matrix');
  const plain = rows.map(({ _run, ...r }) => r);
  fs.writeFileSync(`${base}.json`, `${JSON.stringify({ summary, runs: plain, week: week.rows }, null, 1)}\n`);
  const cols = ['key', 'group', 'level', 'loc', 'minutes', 'days', 'dayIndex', 'goals', 'programs', 'bolt', 'split', 'expectedFocus', 'dayFocus', 'pullGap', 'whyLine', 'title', 'main', 'hard', 'soft', 'exercises', 'evidence'];
  const esc = (v: unknown) => { const s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  fs.writeFileSync(`${base}.csv`, `${[cols.join(','), ...plain.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(','))].join('\n')}\n`);
  let exported = 0;
  if (EXPORT) exported = exportReviewFixtures(rows.filter((r) => r.hard.length || r.soft.length).map((r) => ({ run: r._run, hard: r.hard, evidence: r.evidence })), path.join(OUT_DIR, 'v2-review-fixtures'));

  // ── Hebrew summary table ─────────────────────────────────────────────────
  const pct = (bad: number, n: number) => (n ? `${Math.round(((n - bad) / n) * 100)}%` : '—');
  say(`\nמטריצת v2 (${summary.mode}, seed ${SEED}): ${scenarios.length} תרחישים → ${rows.length} אימונים · ${summary.ms}ms · שגיאות ${errors.length} · כתיבות Firestore ${writes}\n`);
  say('\n  קבוצה                      אימונים  עוברים קשיח  אזהרות  ' + ALL_HARD.join('  ') + '\n');
  for (const grp of groups) {
    const b = byGroup[grp] as Record<string, number>;
    say(`  ${V2_GROUP_HE[grp].padEnd(26)} ${String(b.workouts).padStart(6)}  ${pct(b.hardFail, b.workouts).padStart(10)}  ${String(b.softWarn).padStart(6)}  ${ALL_HARD.map((id) => String(b[id] || '·').padStart(2)).join('  ')}\n`);
  }
  say('\n  אינווריאנט קשיח                                   נכשלו\n');
  for (const id of ALL_HARD) say(`  ${id}  ${HARD_HE[id].padEnd(46)} ${String(perHard[id]).padStart(4)} / ${rows.length}\n`);
  say('\n  אזהרה (רכה)                                       מופעים\n');
  for (const [id, n] of Object.entries(perSoft)) if (n) say(`  ${id}  ${SOFT_LABELS_HE[id].padEnd(46)} ${String(n).padStart(4)}\n`);
  say('\n  שבוע (33 תרחישי schedule-combos + מדיניות + הליכה)  נבדקו  נכשלו\n');
  for (const [id, v] of Object.entries(week.summary.perCheck)) say(`  ${id.padEnd(4)} ${WEEK_LABELS_HE[id].padEnd(46)} ${String(v.n).padStart(5)}  ${String(v.fail).padStart(5)}${v.warn ? ` (אזהרות ${v.warn})` : ''}\n`);
  say(`\n  → ${base}.json / .csv${EXPORT ? ` · ${exported} fixtures → scripts/audit/out/v2-review-fixtures/` : ''}\n`);
  if (errors.length) say(`  errors: ${JSON.stringify(errors.slice(0, 5))}\n`);
  if (writes > 0) { say('FIRESTORE WRITE ATTEMPTED — failing\n'); process.exit(1); }
  process.exit(errors.length ? 1 : 0);
}
main().catch((e) => { process.stderr.write(`CRASH ${(e as Error)?.stack ?? e}\n`); process.exit(1); });
