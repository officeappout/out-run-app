/**
 * scripts/audit/schedule-budget-bench.ts — schedule advisor phase A, bug #9:
 * the strength generator's weekly-budget divisor, BEFORE vs AFTER SCHEDULE_ADVISOR_BUDGET_V1,
 * for hybrid 3+3 users (3 strength days + 3 running days → lifestyle.scheduleDays holds the
 * union of 6 letters; the recurring template holds 3 strength days + 3 running ids).
 *
 * Same hermetic harness as bench:entrypoints (tests/invariants/hermetic): stubbed Firestore
 * replaying the frozen corpus, no network, every write a logged no-op. Each scenario runs
 * twice with the same Math.random seed — flag off (env OUT_SCHEDULE_ADVISOR_BUDGET_V1=0),
 * flag on (=1) — so the only difference is the divisor.
 *
 * Run:  TZ=Asia/Jerusalem npx tsx --tsconfig tests/invariants/hermetic/tsconfig.json scripts/audit/schedule-budget-bench.ts
 * Out:  scripts/audit/out/schedule-budget-bench.json + stdout table
 */
import '../../tests/invariants/hermetic/guard'; // FIRST: no real Firebase, no network
import * as fs from 'fs';
import * as path from 'path';
import { generateHomeWorkout } from '@/features/workout-engine/services/home-workout.service';
import { calculateEstimatedDuration } from '@/features/workout-engine/logic/workout-budgeting.utils';
import { resolveStrengthBudgetDays } from '@/features/schedule/advisor/budget-divisor';
import { isMain } from '../../tests/invariants/hard-invariants';
import { mulberry32, profileFor, type Program, type Scenario } from '../../tests/invariants/entry-points';

const SEED = 20261018;
const OUT_DIR = path.join(process.cwd(), 'scripts/audit/out');
const LEVELS = [3, 6, 10, 15];
const PROGRAMS: Program[] = ['full_body', 'upper_body', 'legs'];
const MINUTES = [30, 45];

function hybridProfile(s: Scenario) {
  const p = profileFor(s) as unknown as Record<string, unknown> & { lifestyle: Record<string, unknown> };
  const prog = s.program === 'auto' ? 'full_body' : s.program;
  p.lifestyle = {
    ...p.lifestyle,
    // strength א/ג/ה ∪ running ב/ד/ו — the union the running bridge leaves behind.
    scheduleDays: ['א', 'ב', 'ג', 'ד', 'ה', 'ו'],
    recurringTemplate: { א: [prog], ג: [prog], ה: [prog], ב: ['run_plan_5k'], ד: ['run_plan_5k'], ו: ['run_plan_5k'] },
  };
  p.running = { isUnlocked: true, scheduleDays: ['ב', 'ד', 'ו'] };
  return p;
}

interface Row {
  scenario: string;
  divisor_off: number;
  divisor_on: number;
  daily_off: number | null;
  daily_on: number | null;
  sets_off: number;
  sets_on: number;
  main_off: number;
  main_on: number;
  min_off: number;
  min_on: number;
}

/** The generator logs its budget math (SplitDecisionService); the bench reads the final daily set budget from it. */
let lastDaily: number | null = null;
function captureBudgetLog(...args: unknown[]) {
  const head = String(args[0] ?? '');
  if (head.startsWith('Final dailySetBudget')) lastDaily = Number(args[args.length - 1]);
  else if (head.startsWith('Total Daily Budget =')) lastDaily = Number(args[1]);
}

async function runOnce(s: Scenario, flag: '0' | '1') {
  process.env.OUT_SCHEDULE_ADVISOR_BUDGET_V1 = flag;
  Math.random = mulberry32(SEED);
  lastDaily = null;
  const profile = hybridProfile(s);
  const r = await generateHomeWorkout({
    userProfile: profile,
    testLocation: 'home',
    availableTime: s.minutes,
    scheduledProgramIds: [s.program],
    skipCycleRestart: true,
  } as unknown as Parameters<typeof generateHomeWorkout>[0]);
  const main = r.workout.exercises.filter(isMain);
  return {
    divisor: resolveStrengthBudgetDays(profile as never, 3),
    daily: lastDaily,
    sets: main.reduce((n, e) => n + (e.sets ?? 0), 0),
    main: main.length,
    minutes: Math.round(calculateEstimatedDuration(r.workout.exercises)),
  };
}

async function main() {
  if (!(globalThis as Record<string, unknown>).__HERMETIC_FIREBASE__ || !(globalThis as Record<string, unknown>).__HERMETIC_GUARD__) {
    throw new Error('NOT hermetic — run with --tsconfig tests/invariants/hermetic/tsconfig.json');
  }
  process.env.WORKOUT_ENGINE_FIXED_SHUFFLE_SEED = String(SEED);
  const say = process.stdout.write.bind(process.stdout);
  for (const k of ['log', 'warn', 'info', 'debug', 'group', 'groupCollapsed', 'groupEnd', 'table', 'error'] as const) {
    (console as unknown as Record<string, unknown>)[k] = () => {};
  }
  console.log = captureBudgetLog;

  const rows: Row[] = [];
  const errors: string[] = [];
  for (const level of LEVELS) for (const program of PROGRAMS) for (const minutes of MINUTES) {
    const s: Scenario = { id: `hybrid3+3/L${level}/${program}/${minutes}m`, entry: 'builder', level, loc: 'home-bar-band', minutes, difficulty: 2, program };
    try {
      const off = await runOnce(s, '0');
      const on = await runOnce(s, '1');
      rows.push({
        scenario: s.id,
        divisor_off: off.divisor, divisor_on: on.divisor,
        daily_off: off.daily, daily_on: on.daily,
        sets_off: off.sets, sets_on: on.sets,
        main_off: off.main, main_on: on.main,
        min_off: off.minutes, min_on: on.minutes,
      });
    } catch (e) {
      errors.push(`${s.id}: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
    }
  }

  const sum = (k: keyof Row) => rows.reduce((n, r) => n + (r[k] as number), 0);
  const avg = (k: keyof Row) => (rows.length ? Math.round((sum(k) / rows.length) * 10) / 10 : 0);
  const changed = rows.filter((r) => r.sets_off !== r.sets_on || r.main_off !== r.main_on).length;
  const summary = {
    scenarios: rows.length,
    errors: errors.length,
    avg: {
      divisor_off: avg('divisor_off'), divisor_on: avg('divisor_on'),
      daily_budget_off: avg('daily_off'), daily_budget_on: avg('daily_on'),
      sets_off: avg('sets_off'), sets_on: avg('sets_on'),
      main_off: avg('main_off'), main_on: avg('main_on'),
      min_off: avg('min_off'), min_on: avg('min_on'),
    },
    scenariosChanged: changed,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'schedule-budget-bench.json'), JSON.stringify({ seed: SEED, summary, rows, errors }, null, 2));

  say('\nscenario | divisor off→on | daily set budget off→on | main sets off→on | main exercises off→on | est. min off→on\n');
  for (const r of rows) {
    say(`${r.scenario} | ${r.divisor_off}→${r.divisor_on} | ${r.daily_off}→${r.daily_on} | ${r.sets_off}→${r.sets_on} | ${r.main_off}→${r.main_on} | ${r.min_off}→${r.min_on}\n`);
  }
  say(`\nSUMMARY ${JSON.stringify(summary)}\n`);
  if (errors.length) say(`ERRORS\n${errors.join('\n')}\n`);
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e));
  process.exit(1);
});
