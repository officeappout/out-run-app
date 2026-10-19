/**
 * Coach note over REAL generator output — hermetic.
 *
 * Runs generateHomeWorkoutTrio on the frozen invariants corpus
 * (tests/invariants/fixtures — same data the invariants gate uses) with
 * Firestore fully stubbed: every read is empty, every write THROWS, so this
 * test can never touch production. Each cell varies one "why" signal
 * (recovery, returning, cycle week, weekly gap, time, location, difficulty)
 * and asserts the rendered "דגשי האימון" note obeys the voice rules.
 *
 * Set COACH_NOTE_PRINT=1 to print the examples (used for the PR body).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

const CORPUS = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('node:path');
  const dir = path.join(process.cwd(), 'tests/invariants/fixtures');
  const load = (n: string) => JSON.parse(fs.readFileSync(path.join(dir, `${n}.json`), 'utf8'));
  return {
    exercises: load('exercises'),
    programs: load('programs'),
    gymEquipment: load('gym_equipment'),
    programLevelSettings: load('program_level_settings') as Array<{ id: string }>,
  };
});

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, storage: {}, functions: {}, app: {} }));

vi.mock('firebase/firestore', async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  const ref = (...parts: unknown[]) => ({ __ref: parts.slice(1).join('/') });
  const noWrite = () => {
    throw new Error('[coach-note fixtures] Firestore write attempted in a hermetic test');
  };
  return {
    ...orig,
    doc: ref,
    collection: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    documentId: () => '__id__',
    getDoc: async () => ({ exists: () => false, data: () => undefined, id: 'x' }),
    getDocFromCache: async () => ({ exists: () => false, data: () => undefined, id: 'x' }),
    getDocs: async () => ({ docs: [], empty: true, size: 0, forEach: () => {} }),
    getDocsFromCache: async () => ({ docs: [], empty: true, size: 0, forEach: () => {} }),
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
    onSnapshot: () => () => {},
    setDoc: noWrite,
    updateDoc: noWrite,
    addDoc: noWrite,
    deleteDoc: noWrite,
    writeBatch: noWrite,
    runTransaction: noWrite,
  };
});

vi.mock('@/features/content/exercises/core/exercise.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAllExercises: async () => CORPUS.exercises,
  getAllExercisesNoOrder: async () => CORPUS.exercises,
  getAllExercisesCached: async () => CORPUS.exercises,
}));
vi.mock('@/features/content/programs/core/program.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAllPrograms: async () => CORPUS.programs,
}));
vi.mock('@/features/content/equipment/gym/core/gym-equipment.service', async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  const { registerGearAlias } = await import('@/features/workout-engine/shared/utils/gear-mapping.utils');
  return {
    ...orig,
    getAllGymEquipment: async () => {
      for (const item of CORPUS.gymEquipment) registerGearAlias(item.id, item.iconKey, undefined, item.name);
      return CORPUS.gymEquipment;
    },
  };
});
vi.mock('@/features/content/programs/core/programLevelSettings.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getProgramLevelSetting: async (programId: string, level: number) =>
    CORPUS.programLevelSettings.find((d) => d.id === `${programId}_level_${level}`) ?? null,
}));

import { generateHomeWorkoutTrio } from '../home-workout.service';
import type { HomeWorkoutOptions } from '../home-workout.types';
import { renderCoachNoteSentences, violatesVoice } from '../coach-note';
import { buildMockProfile } from '../../../../../tests/invariants/profile-factory';

const HOME_GEAR = ['pullup_bar', 'dip_bar', 'parallel_bars'];
const DAY = 24 * 60 * 60 * 1000;

function profile(opts: { weeksIntoCycle?: number; levels?: Record<string, number>; level?: number } = {}) {
  const p = buildMockProfile({
    level: opts.level ?? 12,
    persona: '',
    injuries: [],
    domainLevels: opts.levels ?? { pull: 14, push: 12, legs: 8, core: 6 },
    gear: HOME_GEAR,
  });
  const ap = p.progression?.activePrograms?.[0] as { startDate?: unknown } | undefined;
  if (ap) ap.startDate = new Date(Date.now() - (opts.weeksIntoCycle ?? 1) * 7 * DAY + DAY).toISOString();
  return p;
}

interface Cell {
  name: string;
  options: HomeWorkoutOptions;
}

const CELLS: Cell[] = [
  { name: 'home · morning · cycle week 2', options: { userProfile: profile({ weeksIntoCycle: 2 }), location: 'home', availableTime: 30, timeOfDay: 'morning', daysInactiveOverride: 1 } },
  { name: 'park · evening · back after 6 days', options: { userProfile: profile(), location: 'park', availableTime: 30, timeOfDay: 'evening', daysInactiveOverride: 6 } },
  { name: 'home · night · back after 12 days', options: { userProfile: profile(), location: 'home', availableTime: 20, timeOfDay: 'night', daysInactiveOverride: 12 } },
  { name: 'park · deload week (5)', options: { userProfile: profile({ weeksIntoCycle: 5 }), location: 'park', availableTime: 45, timeOfDay: 'afternoon', daysInactiveOverride: 1 } },
  { name: 'park · peak week (4) · intense', options: { userProfile: profile({ weeksIntoCycle: 4, level: 18, levels: { pull: 20, push: 18, legs: 14, core: 12 } }), location: 'park', availableTime: 45, timeOfDay: 'afternoon', daysInactiveOverride: 1, targetDifficulty: 3 } },
  { name: 'home · weekly gap (pull behind)', options: { userProfile: profile({ weeksIntoCycle: 3 }), location: 'home', availableTime: 30, timeOfDay: 'evening', daysInactiveOverride: 1, domainSetsCompletedThisWeek: { push: 16, pull: 3, legs: 10, core: 8 }, remainingScheduleDays: 2 } },
  { name: 'home · easy option', options: { userProfile: profile({ weeksIntoCycle: 1 }), location: 'home', availableTime: 25, timeOfDay: 'afternoon', daysInactiveOverride: 2, targetDifficulty: 1 } },
  { name: 'office · morning · bodyweight', options: { userProfile: profile({ weeksIntoCycle: 2 }), location: 'office', availableTime: 15, timeOfDay: 'morning', daysInactiveOverride: 1 } },
  { name: 'home · recovery day', options: { userProfile: profile(), location: 'home', availableTime: 20, timeOfDay: 'evening', daysInactiveOverride: 1, isRecoveryDay: true } },
  // Weather (weather_enabled): HomeWorkoutOptions.weather → DecisionContext.weatherFlag.
  { name: 'park · heat', options: { userProfile: profile({ weeksIntoCycle: 1 }), location: 'park', availableTime: 30, timeOfDay: 'afternoon', daysInactiveOverride: 1, weather: { flag: 'heat', apparentC: 36 } } },
  { name: 'park · cold', options: { userProfile: profile({ weeksIntoCycle: 1 }), location: 'park', availableTime: 30, timeOfDay: 'afternoon', daysInactiveOverride: 1, weather: { flag: 'cold', apparentC: 4 } } },
  { name: 'home · rain', options: { userProfile: profile({ weeksIntoCycle: 1 }), location: 'home', availableTime: 30, timeOfDay: 'afternoon', daysInactiveOverride: 1, weather: { flag: 'rain', precipProb: 90 } } },
  { name: 'park · beginner · back after 30 days', options: { userProfile: profile({ level: 3, levels: { pull: 3, push: 4, legs: 3, core: 2 } }), location: 'park', availableTime: 30, timeOfDay: 'morning', daysInactiveOverride: 30 } },
];

const results: Array<{ name: string; note: string[]; codes: string[] }> = [];

describe('coach note over real generator output (hermetic corpus)', () => {
  beforeAll(async () => {
    const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
    const quietG = vi.spyOn(console, 'group').mockImplementation(() => {});
    const quietGE = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    const quietW = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const quietI = vi.spyOn(console, 'info').mockImplementation(() => {});
    const quietD = vi.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      for (const cell of CELLS) {
        const trio = await generateHomeWorkoutTrio({
          ...cell.options,
          skipCycleRestart: true,
          generateSingleOption: cell.options.targetDifficulty == null,
        });
        const focus = cell.options.targetDifficulty != null ? 0 : (trio.meta.defaultFocusIndex ?? 1);
        const w = trio.options[focus]?.result.workout ?? trio.options[1].result.workout;
        results.push({
          name: cell.name,
          note: renderCoachNoteSentences(w.decisionRecord),
          codes: (w.decisionRecord?.reasons ?? []).map((r) => r.code),
        });
      }
    } finally {
      quiet.mockRestore(); quietG.mockRestore(); quietGE.mockRestore();
      quietW.mockRestore(); quietI.mockRestore(); quietD.mockRestore();
    }
    if (process.env.COACH_NOTE_PRINT) {
      for (const r of results) {
        process.stdout.write(`\n### ${r.name}\n[${r.codes.join(', ')}]\n${r.note.join(' ')}\n`);
      }
    }
  }, 120_000);

  it('every cell produced a record and a 2–4 sentence note', () => {
    expect(results).toHaveLength(CELLS.length);
    for (const r of results) {
      expect(r.codes.length, r.name).toBeGreaterThan(0);
      expect(r.note.length, `${r.name}: ${r.note.join(' ')}`).toBeGreaterThanOrEqual(2);
      expect(r.note.length, r.name).toBeLessThanOrEqual(4);
    }
  });

  it('voice: no English, no em-dashes, no emoji', () => {
    for (const r of results) for (const s of r.note) expect(violatesVoice(s), s).toBe(false);
  });

  it('the "why" follows the context signal', () => {
    const by = Object.fromEntries(results.map((r) => [r.name, r.codes]));
    expect(by['home · recovery day'][0]).toBe('RECOVERY_DAY');
    expect(by['park · evening · back after 6 days'][0]).toBe('RETURNING');
    expect(by['park · deload week (5)'][0]).toBe('DELOAD_WEEK');
    expect(by['park · peak week (4) · intense'][0]).toBe('PEAK_WEEK');
    expect(by['home · weekly gap (pull behind)']).toContain('WEEKLY_GAP');
    expect(by['park · heat']).toContain('WEATHER_HEAT');
    expect(by['park · cold']).toContain('WEATHER_COLD');
    expect(by['home · rain']).toContain('WEATHER_RAIN');
    for (const name of ['park · heat', 'park · cold', 'home · rain']) {
      const codes = by[name];
      const w = codes.findIndex((c) => c.startsWith('WEATHER_'));
      const loc = codes.indexOf('LOCATION');
      if (loc >= 0) expect(w, name).toBeLessThan(loc);
    }
  });
});

