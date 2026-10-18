/**
 * scripts/audit/build-entrypoints-bench.ts — 05-BENCHMARK.md extension (2026-10-18):
 * the generator's NEW entry points + the hard invariants + the coach-sheet layer.
 *
 * The 614-workout benchmark (build-snapshot.ts → analyze-benchmark.ts) only drives
 * generateHomeWorkoutTrio. This drives every real entry point with its production
 * option shape (tests/invariants/entry-points.ts): home trio, the builder
 * (body-area chips → strictDomains), the AI chat's generate_workout mapping
 * (+ #434's shaping step automatically once it is on main), park machines, and
 * hybrid route stops — and grades every workout:
 *   hard (tests/invariants/hard-invariants.ts): H1 gear · H2 focus · H3 min count ·
 *        H4 level ≤ +3 · H5 no test items
 *   soft (coach sheets + sanity): S1 order upper→lower→core · S2 count vs coach ·
 *        S3 sets/reps in coach range · S4 rest · S5 minutes ±20% · S6 full-body
 *        balance · S7 duplicates · S8 real warm-up/cool-down · S9 copy not broken ·
 *        S10 similarity to the closest coach reference (family overlap, volume ratio)
 *
 * HERMETIC: must run under tests/invariants/hermetic/tsconfig.json (asserted) —
 * read-only replay of tests/invariants/hermetic/corpus, every fetch throws, every
 * Firestore write is a logged no-op (the run fails if any write was attempted).
 *
 * Run:  npm run bench:entrypoints [-- --seed N] [-- --ci]
 * Out:  scripts/audit/out/entrypoints-bench.json + entrypoints-bench.csv
 */
import '../../tests/invariants/hermetic/guard'; // FIRST: no real Firebase, no network
import * as fs from 'fs';
import * as path from 'path';
import type { GeneratedWorkout, WorkoutExercise } from '@/features/workout-engine/logic/workout-generator.types';
import { calculateEstimatedDuration } from '@/features/workout-engine/logic/workout-budgeting.utils';
import { checkHardInvariants, isMain, baseDomainOf, exName, HARD_LABELS, type HardId, type HardContext } from '../../tests/invariants/hard-invariants';
import { fullMatrix, ciMatrix, runScenario, mulberry32, profileFor, type Scenario, type Run, type Program } from '../../tests/invariants/entry-points';

const args = process.argv.slice(2);
const SEED = Number(args[args.indexOf('--seed') + 1] || 0) || 20261018;
const CI = args.includes('--ci');
const OUT_DIR = path.join(process.cwd(), 'scripts/audit/out');
const REFS = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/workout-engine/coach-sheet-references.json'), 'utf8'));

type Grade = 'pass' | 'warn' | 'fail' | 'n/a';
interface Graded { id: string; grade: Grade; evidence: string }

// ── Coach references ──────────────────────────────────────────────────────
interface RefEx { family: string; sets: number; repMin: number; repMax: number; timed: boolean }
interface Ref { id: string; category: string; level: number; difficulty: number | null; minutes: number; exercises: RefEx[]; restSec: number | null }
const REF_LIST: Ref[] = REFS.references;

function closestRef(category: 'full_body' | 'lower_body', level: number, difficulty: number, minutes: number): Ref | undefined {
  const pool = REF_LIST.filter(r => r.category === category);
  return pool.map(r => ({ r, d: Math.abs(r.level - level) * 2 + Math.abs((r.difficulty ?? 2) - difficulty) * 1.5 + Math.abs(r.minutes - minutes) / 5 }))
    .sort((a, b) => a.d - b.d)[0]?.r;
}
const categoryOf = (s: Scenario): 'full_body' | 'lower_body' | null =>
  s.program === 'legs' || (s.chips?.length && s.chips.every(c => ['quads', 'glutes', 'hamstrings', 'calves', 'lower_body'].includes(c))) ? 'lower_body'
    : (s.program === 'full_body' || (s.program === 'auto' && !s.chips?.length)) ? 'full_body' : null;

// ── Soft graders ──────────────────────────────────────────────────────────
const RANK: Record<string, number> = { push: 0, pull: 0, legs: 1, core: 2 };
function gradeOrder(main: WorkoutExercise[]): Graded {
  const seq = main.map(e => baseDomainOf(e)).filter((d): d is string => d != null && d in RANK);
  let inv = 0;
  for (let i = 1; i < seq.length; i++) if (RANK[seq[i]] < RANK[seq[i - 1]]) inv++;
  return { id: 'S1', grade: inv === 0 ? 'pass' : inv === 1 ? 'warn' : 'fail', evidence: seq.join('>') || '(none)' };
}
function gradeCount(main: WorkoutExercise[], ref?: Ref): Graded {
  if (!ref) return { id: 'S2', grade: 'n/a', evidence: '' };
  const d = main.length - ref.exercises.length;
  return { id: 'S2', grade: Math.abs(d) <= 1 ? 'pass' : Math.abs(d) <= 2 ? 'warn' : 'fail', evidence: `${main.length} vs coach ${ref.exercises.length} (${ref.id})` };
}
function gradeSetsReps(main: WorkoutExercise[], level: number): Graded {
  const bad: string[] = []; const warn: string[] = [];
  for (const e of main) {
    if (e.pyramidSequence?.length || e.repsSequence?.length) continue;
    const core = baseDomainOf(e) === 'core';
    const [lo, hi] = core ? [2, 2] : level <= 2 ? [2, 2] : [2, 3];
    if (e.sets < 2 || e.sets > hi + 1) bad.push(`${exName(e)} ${e.sets}s`); else if (e.sets > hi || e.sets < lo) warn.push(`${exName(e)} ${e.sets}s`);
    if (e.isTimeBased ? (e.reps < 10 || e.reps > 60) : (e.reps < 3 || e.reps > 20)) bad.push(`${exName(e)} ${e.reps}${e.isTimeBased ? 's' : 'r'}`);
  }
  return { id: 'S3', grade: bad.length ? 'fail' : warn.length ? 'warn' : 'pass', evidence: [...bad, ...warn].slice(0, 4).join('; ') };
}
function gradeRest(main: WorkoutExercise[]): Graded {
  const r = main.map(e => e.restSeconds);
  const bad = r.filter(x => x < 20 || x > 240).length; const warn = r.filter(x => x > 180).length;
  return { id: 'S4', grade: bad ? 'fail' : warn ? 'warn' : 'pass', evidence: r.join(',') };
}
function gradeMinutes(w: GeneratedWorkout, requested: number): Graded {
  const est = calculateEstimatedDuration(w.exercises);
  const ratio = est / requested;
  return { id: 'S5', grade: ratio >= 0.8 && ratio <= 1.2 ? 'pass' : ratio >= 0.7 && ratio <= 1.3 ? 'warn' : 'fail', evidence: `${est}/${requested}min` };
}
function gradeBalance(main: WorkoutExercise[], s: Scenario): Graded {
  if (categoryOf(s) !== 'full_body' || s.minutes < 20) return { id: 'S6', grade: 'n/a', evidence: '' };
  const have = new Set(main.map(baseDomainOf));
  const missing = ['push', 'pull', 'legs'].filter(d => !have.has(d));
  return { id: 'S6', grade: missing.length === 0 ? 'pass' : missing.length === 1 ? 'warn' : 'fail', evidence: missing.length ? `missing ${missing.join(',')}` : 'push+pull+legs' };
}
function gradeDuplicates(w: GeneratedWorkout): Graded {
  const ids = w.exercises.filter(isMain).map(e => e.exercise?.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  return { id: 'S7', grade: dup.length ? 'fail' : 'pass', evidence: dup.join(',') };
}
function gradeWarmCool(w: GeneratedWorkout): Graded {
  const wu = w.exercises.filter(e => e.exerciseRole === 'warmup').length;
  const cd = w.exercises.filter(e => e.exerciseRole === 'cooldown').length;
  return { id: 'S8', grade: wu && cd ? 'pass' : wu || cd ? 'warn' : 'fail', evidence: `warmup=${wu} cooldown=${cd}` };
}
const BROKEN = /[א-ת]_[א-ת0-9%]|\d+%_|\{\{|\}\}|\bundefined\b|\bNaN\b|\bnull\b|\[object/;
function gradeCopy(w: GeneratedWorkout): Graded {
  const t = `${w.title ?? ''} ${typeof w.description === 'string' ? w.description : ''}`;
  const m = t.match(BROKEN);
  return { id: 'S9', grade: !w.title ? 'fail' : m ? 'fail' : 'pass', evidence: m ? `…${t.slice(Math.max(0, (m.index ?? 0) - 25), (m.index ?? 0) + 25)}…` : (w.title ?? '').slice(0, 40) };
}
function gradeSimilarity(main: WorkoutExercise[], ref?: Ref): Graded & { overlap?: number; volumeRatio?: number } {
  if (!ref) return { id: 'S10', grade: 'n/a', evidence: '' };
  const cnt = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
  const g = cnt(main.map(e => baseDomainOf(e) ?? 'other')); const r = cnt(ref.exercises.map(e => e.family));
  const keys = Array.from(new Set([...Object.keys(g), ...Object.keys(r)]));
  let inter = 0, uni = 0; for (const k of keys) { inter += Math.min(g[k] ?? 0, r[k] ?? 0); uni += Math.max(g[k] ?? 0, r[k] ?? 0); }
  const overlap = uni ? inter / uni : 0;
  const genSets = main.reduce((s, e) => s + (e.pyramidSequence?.length ?? e.sets), 0);
  const refSets = ref.exercises.reduce((s, e) => s + e.sets, 0);
  const volumeRatio = refSets ? genSets / refSets : 0;
  const grade: Grade = overlap >= 0.6 && volumeRatio >= 0.67 && volumeRatio <= 1.5 ? 'pass' : overlap >= 0.4 && volumeRatio >= 0.5 ? 'warn' : 'fail';
  return { id: 'S10', grade, evidence: `overlap ${overlap.toFixed(2)} · sets ${genSets}/${refSets} (${ref.id})`, overlap, volumeRatio };
}

// ── Hybrid route stops (full mode only) ───────────────────────────────────
async function runRouteStops(level: number, minutes: number, difficulty: 1 | 2 | 3): Promise<Run[]> {
  // The hybrid module graph pulls browser-only libs (map stack) that reference `self` at import.
  const g = globalThis as Record<string, unknown>;
  if (!g.self) g.self = globalThis;
  const [{ composeHybridPlan }, { useUserStore }] = await Promise.all([
    import('@/features/workout-engine/hybrid/start-hybrid-session'),
    import('@/features/user/identity/store/useUserStore'),
  ]);
  const routes: { id: string; published?: boolean; path: { lng: number; lat: number }[] }[] =
    JSON.parse(fs.readFileSync(path.join(process.env.HERMETIC_CORPUS_DIR || 'tests/invariants/hermetic/corpus', 'official_routes.json'), 'utf8'));
  const route = routes.find(r => r.id === 'ki7wFmd6uxLarPyd1pcw') ?? routes.find(r => r.published);
  const s: Scenario = { id: `route_stops/L${level}/${minutes}m/D${difficulty}`, entry: 'trio', level, loc: 'park-typical', minutes, difficulty, program: 'auto' };
  const profile = profileFor({ ...s, loc: 'home-nogear' });
  (useUserStore as unknown as { setState: (p: unknown) => void }).setState({ profile });
  const p0 = route!.path[0];
  const composed = await composeHybridPlan(
    { timeBudgetMin: minutes, aerobicShare: 0.55, emphasis: 'balanced', aerobicKind: 'walking', difficulty, mode: 'route_stops' },
    { userPosition: { lat: p0.lat, lng: p0.lng }, startRun: () => {} },
  );
  const runs: Run[] = [];
  const segs = (composed?.plan?.segments ?? []) as { kind: string; availableEquipment?: string[]; content?: { exercises: WorkoutExercise[]; isEmpty?: boolean; estimatedDurationSec?: number } }[];
  segs.filter(x => x.kind === 'strength' && x.content && !x.content.isEmpty).forEach((seg, i) => {
    const w = { exercises: seg.content!.exercises, title: 'route stop', difficulty, estimatedDuration: Math.round((seg.content!.estimatedDurationSec ?? 0) / 60) } as unknown as GeneratedWorkout;
    const ctx: HardContext = { location: 'park', availableGear: seg.availableEquipment ?? [], requestedMinutes: minutes, skipCount: true };
    runs.push({ scenario: { ...s, id: `${s.id}/stop${i + 1}` }, bolt: difficulty, workout: w, ctx, meta: { stop: i + 1, stopMin: w.estimatedDuration, hybrid: true } });
  });
  if (!runs.length) runs.push({ scenario: s, bolt: difficulty, workout: { exercises: [], title: '' } as unknown as GeneratedWorkout, ctx: { location: 'park', availableGear: [], requestedMinutes: minutes, skipCount: true }, meta: { hybrid: true, empty: true, hint: composed?.fallbackHint } });
  return runs;
}

// ── #434 shaping (applied automatically once workout-shaping.pure.ts exists on main) ──
async function loadShaping(): Promise<null | ((w: GeneratedWorkout, o: Record<string, unknown>) => unknown)> {
  const p = '@/features/ai-coach/services/workout-shaping.pure';
  try { const m = await import(/* @vite-ignore */ p); return m.shapeAiWorkout ?? null; } catch { return null; }
}

// ── Main ──────────────────────────────────────────────────────────────────
function referenceScenarios(): Scenario[] {
  return REF_LIST.map(r => {
    const program: Program = r.category === 'lower_body' ? 'legs' : 'full_body';
    const minutes = r.minutes; const difficulty = (r.difficulty ?? 2) as 1 | 2 | 3;
    return { id: `ref:${r.id}/builder/L${r.level}/park-typical/${minutes}m/D${difficulty}/${program}`, entry: 'builder', level: r.level, loc: 'park-typical', minutes, difficulty, program };
  });
}

async function main() {
  if (!(globalThis as Record<string, unknown>).__HERMETIC_FIREBASE__ || !(globalThis as Record<string, unknown>).__HERMETIC_GUARD__) throw new Error('NOT hermetic — run via npm run bench:entrypoints (tests/invariants/hermetic/tsconfig.json)');
  (globalThis as Record<string, unknown>).fetch = async (u: unknown) => { throw new Error(`network disabled: ${String(u).slice(0, 60)}`); };
  process.env.WORKOUT_ENGINE_FIXED_SHUFFLE_SEED = String(SEED);
  const say = process.stdout.write.bind(process.stdout);
  for (const k of ['log', 'warn', 'info', 'debug', 'group', 'groupCollapsed', 'groupEnd', 'table', 'error'] as const) (console as unknown as Record<string, unknown>)[k] = () => {};
  const shaping = CI ? null : await loadShaping();

  const scenarios = CI ? ciMatrix() : [...fullMatrix(SEED), ...referenceScenarios()];
  const t0 = Date.now();
  const rows: Record<string, unknown>[] = [];
  const errors: { id: string; error: string }[] = [];
  const doRuns = async (label: string, fn: () => Promise<Run[]>) => {
    Math.random = mulberry32(SEED);
    try { return await fn(); } catch (e) { errors.push({ id: label, error: String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ').slice(0, 400) }); return []; }
  };
  const allRuns: Run[] = [];
  for (const s of scenarios) allRuns.push(...await doRuns(s.id, () => runScenario(s)));
  if (!CI) for (const [lv, min, d] of [[3, 30, 2], [10, 30, 2], [15, 45, 3], [1, 20, 1]] as [number, number, 1 | 2 | 3][]) allRuns.push(...await doRuns(`route_stops/L${lv}`, () => runRouteStops(lv, min, d)));

  for (const r of allRuns) {
    const s = r.scenario;
    let w = r.workout;
    if (s.entry === 'ai' && shaping) {
      w = JSON.parse(JSON.stringify(w));
      shaping(w, { durationMin: s.minutes, location: r.ctx.location, domains: r.ctx.strictDomains ?? [], title: w.title, nameOf: exName, estimateMinutes: calculateEstimatedDuration });
    }
    const main = w.exercises.filter(isMain);
    const hard = checkHardInvariants(w, r.ctx);
    const isHybrid = !!r.meta?.hybrid;
    const cat = isHybrid ? null : categoryOf(s); // a route stop is one station, not a whole session
    const ref = cat ? (s.id.startsWith('ref:') ? REF_LIST.find(x => s.id.startsWith(`ref:${x.id}/`)) : closestRef(cat, s.level, r.bolt, s.minutes)) : undefined;
    const soft = [
      gradeOrder(main), gradeCount(main, ref), gradeSetsReps(main, s.level), gradeRest(main),
      isHybrid ? { id: 'S5', grade: 'n/a' as Grade, evidence: '' } : gradeMinutes(w, s.minutes),
      isHybrid ? { id: 'S6', grade: 'n/a' as Grade, evidence: '' } : gradeBalance(main, s), gradeDuplicates(w), isHybrid ? { id: 'S8', grade: 'n/a' as Grade, evidence: '' } : gradeWarmCool(w),
      isHybrid ? { id: 'S9', grade: 'n/a' as Grade, evidence: '' } : gradeCopy(w), gradeSimilarity(main, ref),
    ];
    const hardGrades = (['H1', 'H2', 'H3', 'H4', 'H5'] as HardId[]).map(id => {
      const v = hard.filter(x => x.id === id);
      const applicable = id === 'H2' ? !!r.ctx.strictDomains?.length : id === 'H3' ? !r.ctx.skipCount : id === 'H1' ? ['home', 'office', 'park'].includes(r.ctx.location) : true;
      return { id, grade: (!applicable ? 'n/a' : v.length ? 'fail' : 'pass') as Grade, evidence: v.map(x => x.detail).join(' | ') };
    });
    rows.push({
      scenario: s.id, entry: isHybrid ? 'route_stops' : s.entry, level: s.level, loc: s.loc, minutes: s.minutes, difficulty: s.difficulty, bolt: r.bolt,
      program: s.program, chips: s.chips?.join('+') ?? '', ai_shaped: s.entry === 'ai' && !!shaping,
      title: w.title ?? '', est_min: calculateEstimatedDuration(w.exercises), main: main.length,
      exercises: main.map(e => `${baseDomainOf(e) ?? e.exercise?.movementGroup}:${exName(e)} ${e.sets}x${e.reps}${e.isTimeBased ? 's' : ''} r${e.restSeconds}`).join(' | '),
      warmup: w.exercises.filter(e => e.exerciseRole === 'warmup').map(exName).join(' | '),
      cooldown: w.exercises.filter(e => e.exerciseRole === 'cooldown').map(exName).join(' | '),
      ref: ref?.id ?? '', grades: Object.fromEntries([...hardGrades, ...soft].map(g => [g.id, g.grade])),
      evidence: Object.fromEntries([...hardGrades, ...soft].filter(g => g.grade === 'fail' || g.grade === 'warn').map(g => [g.id, g.evidence])),
      ...('overlap' in soft[9] ? { ref_overlap: r1((soft[9] as { overlap?: number }).overlap), ref_volume_ratio: r1((soft[9] as { volumeRatio?: number }).volumeRatio) } : {}),
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const GRADERS = ['H1', 'H2', 'H3', 'H4', 'H5', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'];
  const SOFT_LABELS: Record<string, string> = {
    S1: 'order upper→lower→core', S2: 'count vs coach', S3: 'sets/reps in coach range', S4: 'rest 20-240s', S5: 'minutes ±20%',
    S6: 'full-body push+pull+legs', S7: 'no duplicates', S8: 'warm-up + cool-down', S9: 'title/description intact', S10: 'similar to coach reference',
  };
  const g = (row: Record<string, unknown>, id: string) => (row.grades as Record<string, Grade>)[id];
  const perGrader = Object.fromEntries(GRADERS.map(id => {
    const app = rows.filter(r => g(r, id) !== 'n/a');
    const n = (x: Grade) => app.filter(r => g(r, id) === x).length;
    return [id, { label: (HARD_LABELS as Record<string, string>)[id] ?? SOFT_LABELS[id], n: app.length, pass: n('pass'), warn: n('warn'), fail: n('fail'), passPct: app.length ? r1((n('pass') / app.length) * 100) : null }];
  }));
  const byEntry = Object.fromEntries(Array.from(new Set(rows.map(r => r.entry as string))).map(e => {
    const rs = rows.filter(r => r.entry === e);
    return [e, Object.fromEntries(['n', ...GRADERS].map(id => id === 'n' ? [id, rs.length] : [id, (() => { const a = rs.filter(r => g(r, id) !== 'n/a'); return a.length ? r1(a.filter(r => g(r, id) === 'pass').length / a.length * 100) : null; })()]))];
  }));
  const byMinutes = Object.fromEntries([10, 15, 20, 30, 45, 60].map(m => {
    const rs = rows.filter(r => r.minutes === m && r.entry !== 'route_stops');
    return [m, { n: rs.length, avgMain: rs.length ? r1(rs.reduce((s, r) => s + (r.main as number), 0) / rs.length) : null, H3pass: rs.length ? r1(rs.filter(r => g(r, 'H3') === 'pass').length / rs.length * 100) : null }];
  }));
  const hardFails = (r: Record<string, unknown>) => ['H1', 'H2', 'H3', 'H4', 'H5'].filter(id => g(r, id) === 'fail').length;
  const softFails = (r: Record<string, unknown>) => GRADERS.filter(id => id.startsWith('S') && g(r, id) === 'fail').length;
  const worst = [...rows].sort((a, b) => (hardFails(b) * 10 + softFails(b)) - (hardFails(a) * 10 + softFails(a))).slice(0, 15)
    .map(r => ({ scenario: r.scenario, bolt: r.bolt, hardFails: hardFails(r), softFails: softFails(r), main: r.main, est: r.est_min, exercises: r.exercises, evidence: r.evidence }));
  const topFailures = Object.fromEntries(GRADERS.map(id => {
    const fails = rows.filter(r => g(r, id) === 'fail');
    const ev = new Map<string, number>();
    for (const r of fails) { const e = String((r.evidence as Record<string, string>)[id] ?? '').replace(/\d+/g, '#').slice(0, 90); ev.set(e, (ev.get(e) ?? 0) + 1); }
    return [id, { fails: fails.length, patterns: Array.from(ev.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4), examples: fails.slice(0, 2).map(r => ({ scenario: r.scenario, bolt: r.bolt, exercises: r.exercises, evidence: (r.evidence as Record<string, string>)[id] })) }];
  }));
  const sideBySide = REF_LIST.map(ref => {
    const r = rows.find(x => String(x.scenario).startsWith(`ref:${ref.id}/`));
    return {
      ref: ref.id, level: ref.level, difficulty: ref.difficulty, minutes: ref.minutes,
      coach: ref.exercises.map(e => `${e.family}:${e.sets}x${e.repMin}-${e.repMax}${e.timed ? 's' : ''}`).join(' '),
      coachSets: ref.exercises.reduce((s, e) => s + e.sets, 0),
      generator: r ? r.exercises : '(error)', generatorMain: r?.main, generatorEst: r?.est_min, overlap: r?.ref_overlap, volumeRatio: r?.ref_volume_ratio,
    };
  });
  const fsLog = ((globalThis as Record<string, unknown>).__HERMETIC_FS_LOG ?? []) as { op: string }[];
  const writes = fsLog.filter(l => l.op.startsWith('WRITE')).length;
  const summary = {
    generatedAt: new Date().toISOString(), mode: CI ? 'ci' : 'full', seed: SEED, scenarios: scenarios.length, workouts: rows.length, errors,
    ms: Date.now() - t0, aiShapingApplied: !!shaping, hermetic: { firestoreReads: fsLog.filter(l => l.op === 'read').length, blockedWrites: writes },
    corpusNote: 'tests/invariants/hermetic/corpus = public REST dump 2026-10-17; programLevelSettings (auth-only) absent → weekly budget falls back to max(4, level×2)',
    perGrader, byEntry, byMinutes, topFailures, worst, sideBySide,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const base = path.join(OUT_DIR, CI ? 'entrypoints-bench-ci' : 'entrypoints-bench');
  fs.writeFileSync(`${base}.json`, JSON.stringify({ summary, runs: rows }, null, 1));
  const cols = ['scenario', 'entry', 'level', 'loc', 'minutes', 'difficulty', 'bolt', 'program', 'chips', 'ai_shaped', 'main', 'est_min', ...GRADERS, 'ref', 'ref_overlap', 'ref_volume_ratio', 'title', 'exercises', 'warmup', 'cooldown', 'evidence'];
  const esc = (v: unknown) => { const s = typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  fs.writeFileSync(`${base}.csv`, [cols.join(','), ...rows.map(r => cols.map(c => esc(GRADERS.includes(c) ? g(r, c) : r[c])).join(','))].join('\n'));

  say(`\nEntry-point bench (${summary.mode}, seed ${SEED}): ${scenarios.length} scenarios → ${rows.length} workouts in ${summary.ms}ms, errors=${errors.length}, firestore writes=${writes}, ai shaping=${!!shaping}\n`);
  for (const id of GRADERS) { const p = perGrader[id]; say(`  ${id.padEnd(4)} ${String(p.label).padEnd(34)} pass ${String(p.passPct ?? '—').padStart(5)}%  (${p.pass}/${p.n}, warn ${p.warn}, fail ${p.fail})\n`); }
  say(`  by entry: ${JSON.stringify(byEntry)}\n  by minutes: ${JSON.stringify(byMinutes)}\n  → ${base}.json / .csv\n`);
  if (errors.length) say(`  errors: ${JSON.stringify(errors.slice(0, 5))}\n`);
  if (writes > 0) { say('FIRESTORE WRITE ATTEMPTED — failing\n'); process.exit(1); }
  process.exit(0);
}
function r1(n: number | undefined | null) { return n == null ? null : Math.round(n * 100) / 100; }
main().catch(e => { process.stderr.write(`CRASH ${(e as Error)?.stack ?? e}\n`); process.exit(1); });
