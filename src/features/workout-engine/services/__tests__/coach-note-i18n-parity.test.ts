/**
 * i18n wave 2B (namespace `coach`, keys `note.*`): text-builder parity for coach-note.ts.
 * Snapshots were recorded from UNMODIFIED origin/main BEFORE the extraction; the extraction commit must pass them
 * unchanged. Covers every reason code x every phrase variant (seeds 0..5), the expect-sentence matrix
 * (counts 0/1/2/5/12, sets/reps/rest ranges, tabata, durations), the fmtRest grid, the name tables and the
 * phrasebook override seam.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COACH_PHRASEBOOK,
  DOMAIN_NAME_HE,
  PROGRAM_NAME_HE,
  fmtRest,
  renderCoachNote,
  renderCoachNoteSentences,
} from '../coach-note';
import type { DecisionExpect, DecisionReason, DecisionRecord, NumRange } from '../decision-record';

const snap = (name: string) => `./__snapshots__/coach-note-i18n/${name}.txt`;

const baseExpect = (over: Partial<DecisionExpect> = {}): DecisionExpect => ({
  structure: 'standard' as never,
  protocol: 'straight',
  exercisesCount: 6,
  setsRange: { min: 3, max: 3 },
  repRange: { min: 8, max: 12, unit: 'reps' },
  restRange: { min: 60, max: 90 },
  intensityWord: 'balanced',
  durationMin: 35,
  ...over,
});

const rec = (reasons: DecisionReason[], seed: number, expectOver: Partial<DecisionExpect> = {}): DecisionRecord => ({
  v: 1,
  seed,
  reasons,
  expect: baseExpect(expectOver),
});

const DOMAINS = Object.keys(DOMAIN_NAME_HE).concat(['unknown_skill']);
const PROGRAMS = Object.keys(PROGRAM_NAME_HE).concat(['unknown_program']);
const LOCS = ['home', 'park', 'gym', 'office', 'street', 'school', 'airport', 'library', 'desk', 'mars'];

const REASON_SETS: Array<[string, DecisionReason[]]> = [
  ['recovery', [{ code: 'RECOVERY_DAY' }]],
  ['returning-4', [{ code: 'RETURNING', days: 4 }]],
  ['returning-1000', [{ code: 'RETURNING', days: 1000 }]],
  ['deload', [{ code: 'DELOAD_WEEK', week: 4 }]],
  ['peak', [{ code: 'PEAK_WEEK', week: 3 }]],
  ['build-1', [{ code: 'BUILD_WEEK', week: 1 }]],
  ['build-12', [{ code: 'BUILD_WEEK', week: 12 }]],
  ['rain', [{ code: 'WEATHER_RAIN' }]],
  ['heat', [{ code: 'WEATHER_HEAT' }]],
  ['cold', [{ code: 'WEATHER_COLD' }]],
  ['uv', [{ code: 'WEATHER_UV' }]],
  ['rain+location', [{ code: 'WEATHER_RAIN' }, { code: 'LOCATION', loc: 'home', gearSummary: 'bodyweight' }]],
  ['time-morning', [{ code: 'TIME', slot: 'morning' }]],
  ['time-evening', [{ code: 'TIME', slot: 'evening' }]],
  ['time-night', [{ code: 'TIME', slot: 'night' }]],
  ['diff-easy', [{ code: 'DIFFICULTY', level: 'easy' }]],
  ['diff-balanced', [{ code: 'DIFFICULTY', level: 'balanced' }]],
  ['diff-intense', [{ code: 'DIFFICULTY', level: 'intense' }]],
  ['ceiling', [{ code: 'LEVEL_CEILING' }]],
  ['ceiling+program', [{ code: 'LEVEL_CEILING' }, { code: 'PROGRAM_FOCUS', program: 'push', level: 7 }]],
  ['program-no-news', [{ code: 'PROGRAM_FOCUS', program: 'push', level: 7 }]],
  ['rested', [{ code: 'MUSCLES_RESTED', muscles: ['chest'] }]],
  ['two-whys', [{ code: 'DELOAD_WEEK', week: 4 }, { code: 'TIME', slot: 'morning' }, { code: 'DIFFICULTY', level: 'easy' }]],
  ...DOMAINS.map((d): [string, DecisionReason[]] => [`gap-${d}`, [{ code: 'WEEKLY_GAP', domain: d, pct: 35 }]]),
  ...DOMAINS.map((d): [string, DecisionReason[]] => [`skill-${d}`, [{ code: 'SKILL_FOCUS', skill: d }]]),
  ...PROGRAMS.map((p): [string, DecisionReason[]] => [
    `program-${p}`,
    [{ code: 'LEVEL_CEILING' }, { code: 'PROGRAM_FOCUS', program: p, level: 12 }],
  ]),
  ...LOCS.flatMap((l): Array<[string, DecisionReason[]]> => [
    [`loc-${l}-bw`, [{ code: 'LOCATION', loc: l, gearSummary: 'bodyweight' }]],
    [`loc-${l}-eq`, [{ code: 'LOCATION', loc: l, gearSummary: 'equipment' }]],
  ]),
];

const EXPECTS: Array<[string, Partial<DecisionExpect>]> = [
  ['default', {}],
  ['n0', { exercisesCount: 0 }],
  ['n1', { exercisesCount: 1 }],
  ['n2', { exercisesCount: 2 }],
  ['n12', { exercisesCount: 12 }],
  ['dur0', { durationMin: 0 }],
  ['dur1000', { durationMin: 1000 }],
  ['sets1', { setsRange: { min: 1, max: 1 } }],
  ['sets3-4', { setsRange: { min: 3, max: 4 } }],
  ['sets2-5', { setsRange: { min: 2, max: 5 } }],
  ['reps1', { repRange: { min: 1, max: 1, unit: 'reps' } }],
  ['reps10', { repRange: { min: 10, max: 10, unit: 'reps' } }],
  ['reps6-12', { repRange: { min: 6, max: 12, unit: 'reps' } }],
  ['secs30-45', { repRange: { min: 30, max: 45, unit: 'seconds' } }],
  ['secs20', { repRange: { min: 20, max: 20, unit: 'seconds' } }],
  ['secs10-60', { repRange: { min: 10, max: 60, unit: 'seconds' } }],
  ['no-reps', { repRange: null }],
  ['no-reps-rest-120-150', { repRange: null, restRange: { min: 120, max: 150 } }],
  ['no-reps-rest-45-150', { repRange: null, restRange: { min: 45, max: 150 } }],
  ['no-reps-rest-60-180', { repRange: null, restRange: { min: 60, max: 180 } }],
  ['no-reps-rest-105-180', { repRange: null, restRange: { min: 105, max: 180 } }],
  ['no-reps-rest-30', { repRange: null, restRange: { min: 30, max: 30 } }],
  ['no-reps-no-sets', { repRange: null, setsRange: null, restRange: null }],
  ['no-sets', { setsRange: null }],
  ['tabata', { protocol: 'tabata', tabata: { workSec: 20, restSec: 10, rounds: 8 } }],
  ['tabata-missing', { protocol: 'tabata' }],
  ['pyramid', { protocol: 'pyramid' }],
  ['antagonist', { protocol: 'antagonist' }],
  ['superset', { protocol: 'superset' }],
  ['emom', { protocol: 'emom' }],
];

describe('coach-note text parity', () => {
  it('phrasebook + name tables', async () => {
    await expect(JSON.stringify({ DEFAULT_COACH_PHRASEBOOK, DOMAIN_NAME_HE, PROGRAM_NAME_HE }, null, 1)).toMatchFileSnapshot(
      snap('tables'),
    );
  });

  it('every reason set x seeds 0..5', async () => {
    const lines: string[] = [];
    for (const [name, reasons] of REASON_SETS) {
      for (let seed = 0; seed < 6; seed++) {
        lines.push(`${name} #${seed}: ${JSON.stringify(renderCoachNoteSentences(rec(reasons, seed)))}`);
      }
    }
    await expect(lines.join('\n')).toMatchFileSnapshot(snap('reasons'));
  });

  it('expect matrix x a few reason sets x seeds 0..2', async () => {
    const reasonPick = ['recovery', 'time-evening', 'time-night', 'deload', 'two-whys', 'ceiling+program'];
    const lines: string[] = [];
    for (const [rname, reasons] of REASON_SETS.filter(([n]) => reasonPick.includes(n))) {
      for (const [ename, over] of EXPECTS) {
        for (let seed = 0; seed < 3; seed++) {
          lines.push(`${rname} | ${ename} #${seed}: ${JSON.stringify(renderCoachNoteSentences(rec(reasons, seed, over)))}`);
        }
      }
    }
    await expect(lines.join('\n')).toMatchFileSnapshot(snap('expect'));
  });

  it('fmtRest grid', async () => {
    const lines: string[] = [];
    const steps: number[] = [];
    for (let s = 0; s <= 420; s += 15) steps.push(s);
    steps.push(10, 29, 31, 44, 59, 89, 91, 119, 121, 7200);
    for (const min of steps) for (const max of steps) if (max >= min) lines.push(`${min}-${max}: ${fmtRest({ min, max } as NumRange)}`);
    await expect(lines.join('\n')).toMatchFileSnapshot(snap('fmt-rest'));
  });

  it('phrasebook override seam + invalid input', async () => {
    const r = rec([{ code: 'RETURNING', days: 5 }, { code: 'TIME', slot: 'morning' }], 1);
    const out = [
      renderCoachNote(r, { phrasebook: { RETURNING: ['חזרה אחרי {days} ימים.'] } }),
      renderCoachNote(r, { phrasebook: { RETURNING: ['יש {missing} כאן.'] } }),
      renderCoachNote(r, { phrasebook: { EXPECT_volume: [], EXPECT_rest: [] } }),
      renderCoachNote(r, { phrasebook: { TIME_morning: ['English text'] } }),
      JSON.stringify(renderCoachNote(null)),
      JSON.stringify(renderCoachNote({ ...r, v: 2 as unknown as 1 })),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap('override'));
  });
});
