import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Copy guards in the workout-metadata resolver:
 *
 * 1. Sport filtering — logic cues were filtered only by `variant`, so running
 *    cues ("הריצה צריכה להיות עדינה", bundle run_rec_senior) and airport cues
 *    ("מתיחות בטרמינל", gen_airport_01) reached Strength previews. Rows carry
 *    no sportType, so classifyContentSport uses the bundleId convention
 *    (run_* / prog_* / week_*). Strength-tagged titles must not reach a
 *    Running session either.
 * 2. Unresolved-tag safety net — the old strip regex was `/@[\w_]+/g` (no `u`
 *    flag) and never matched a Hebrew tag. Rows that would still render an
 *    unresolved tag are now skipped in favor of the next-best row, or dropped
 *    to null (generator fallback) when none is left.
 */

const state = vi.hoisted(() => ({
  ROWS: {} as Record<string, any[]>,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, _base: string, parentDoc: string, _subCol: string) => ({ __parentDoc: parentDoc }),
  getDocs: async (ref: { __parentDoc: string }) => {
    const rows = state.ROWS[ref.__parentDoc] ?? [];
    return { empty: rows.length === 0, docs: rows.map(r => ({ data: () => r })) };
  },
  query: vi.fn(),
  where: vi.fn(),
}));

import {
  resolveWorkoutMetadata,
  classifyContentSport,
  isAirportSpecificContent,
  type WorkoutMetadataContext,
} from '../workout-metadata.service';

const strengthCtx: WorkoutMetadataContext = {
  persona: null,
  location: 'home',
  timeOfDay: 'morning',
};

const runningCtx: WorkoutMetadataContext = {
  persona: null,
  location: 'park',
  timeOfDay: 'morning',
  sportType: 'running',
  runningCategory: 'easy_run',
  runningBasePace: 360,
};

beforeEach(() => {
  state.ROWS = {};
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('classifyContentSport', () => {
  it('uses an explicit sportType first', () => {
    expect(classifyContentSport({ sportType: 'running', bundleId: 'gen_x' })).toBe('running');
    expect(classifyContentSport({ sportType: 'calisthenics', bundleId: 'run_x' })).toBe('strength');
  });

  it('falls back to the running bundle prefixes', () => {
    for (const bundleId of ['run_rec_senior', 'prog_5k_first', 'week_01_start', 'week_gen_stuck', 'young_mom_morning_run']) {
      expect(classifyContentSport({ bundleId })).toBe('running');
    }
  });

  it('treats everything else as neutral', () => {
    for (const bundleId of ['gen_park_pro_01', 'tech_morning', 'sadir_combat_01', 'mom_runner_x_not_prefix', '']) {
      // "runner" is not a standalone "run" token
      expect(classifyContentSport({ bundleId })).toBe('neutral');
    }
  });
});

describe('isAirportSpecificContent', () => {
  it('flags airport bundles and terminal/flight copy', () => {
    expect(isAirportSpecificContent({ bundleId: 'gen_airport_01', text: 'x' })).toBe(true);
    expect(isAirportSpecificContent({ bundleId: 'run_airport_legs', text: 'x' })).toBe(true);
    expect(isAirportSpecificContent({ bundleId: 'gen_x', text: "מתיחות 'שקטות' שאפשר לעשות בטרמינל" })).toBe(true);
    expect(isAirportSpecificContent({ bundleId: 'gen_x', text: 'הישיבה בטיסה מאטה את זרימת הדם' })).toBe(true);
  });

  it('passes ordinary copy', () => {
    expect(isAirportSpecificContent({ bundleId: 'gen_park_pro_02', text: 'גיוס יחידות מוטוריות מקסימלי.' })).toBe(false);
  });
});

describe('logic cues — sport and airport filtering', () => {
  const runCue = { bundleId: 'run_rec_senior', variant: 'easy', location: '', text: 'מטרת האימון: שיקום וזרימת דם. הריצה צריכה להיות עדינה מאוד.' };
  const progCue = { bundleId: 'prog_5k_first', variant: 'easy', location: '', text: 'המטרה היא המרחק, לא הקצב.' };
  const airportCue = { bundleId: 'gen_airport_01', variant: 'easy', location: '', text: "מתיחות 'שקטות' שאפשר לעשות בטרמינל בלי שיסתכלו עליכם מוזר." };
  const strengthCue = { bundleId: 'gen_park_pro_02', variant: 'easy', location: '', text: 'כל חזרה צריכה להיות בשליטה מלאה.' };

  it('a Strength session never gets running or airport cues, even when they match the variant', async () => {
    state.ROWS.logicCues = [runCue, progCue, airportCue, strengthCue];
    for (let i = 0; i < 20; i++) {
      const res = await resolveWorkoutMetadata(strengthCtx, 'easy');
      expect(res.logicCue).toBe(strengthCue.text);
    }
  });

  it('returns null (generator fallback) when only running/airport cues exist', async () => {
    state.ROWS.logicCues = [runCue, progCue, airportCue];
    const res = await resolveWorkoutMetadata(strengthCtx, 'easy');
    expect(res.logicCue).toBeNull();
  });

  it('airport cues are allowed when the session is at the airport', async () => {
    state.ROWS.logicCues = [airportCue];
    const res = await resolveWorkoutMetadata({ ...strengthCtx, location: 'airport' }, 'easy');
    expect(res.logicCue).toBe(airportCue.text);
  });
});

describe('titles / descriptions — sport filtering', () => {
  it('running descriptions (no sportType, location home) never reach a Strength session', async () => {
    state.ROWS.smartDescriptions = [
      { bundleId: 'run_easy_parent', location: 'home', description: 'מטרת הריצה: בניית בסיס אירובי.' },
      { bundleId: 'gen_heat_01', location: 'home', description: 'אימון ביתי קצר.' },
    ];
    for (let i = 0; i < 20; i++) {
      const res = await resolveWorkoutMetadata(strengthCtx);
      expect(res.description).toBe('אימון ביתי קצר.');
    }
  });

  it('strength-tagged titles (sportType calisthenics, persona any) never reach a Running session', async () => {
    state.ROWS.workoutTitles = [
      { bundleId: 'gen_park_pro_01', persona: 'any', location: 'park', sportType: 'calisthenics', text: 'פרוטוקול כוח ב@מיקום' },
      { bundleId: 'gen_sunday_01', persona: 'generic', location: '', text: 'תחילת שבוע: חוזרים למסלול' },
    ];
    for (let i = 0; i < 20; i++) {
      const res = await resolveWorkoutMetadata(runningCtx);
      expect(res.title).toBe('תחילת שבוע: חוזרים למסלול');
    }
  });
});

describe('unresolved Hebrew tags — next-best row or generator fallback', () => {
  it('skips a title whose Hebrew tag cannot resolve and picks the next-best row', async () => {
    state.ROWS.workoutTitles = [
      // Higher score (persona any → +50), but @סקייל_נוכחי has no step in ctx.
      { bundleId: 'gen_park_pro_06', persona: 'any', location: 'home', text: 'מיקוד @סקייל_נוכחי: עוצמה ב@מיקום' },
      { bundleId: 'gen_rain_01', persona: '', location: '', text: 'אימון ביתי ליום סגריר' },
    ];
    for (let i = 0; i < 10; i++) {
      const res = await resolveWorkoutMetadata(strengthCtx);
      expect(res.title).toBe('אימון ביתי ליום סגריר');
    }
  });

  it('uses the same row once the tag can resolve', async () => {
    state.ROWS.workoutTitles = [
      { bundleId: 'gen_park_pro_06', persona: 'any', location: 'home', text: 'מיקוד @סקייל_נוכחי: עוצמה ב@מיקום' },
      { bundleId: 'gen_rain_01', persona: '', location: '', text: 'אימון ביתי ליום סגריר' },
    ];
    const res = await resolveWorkoutMetadata({ ...strengthCtx, currentProgressionStep: 'שכיבות יהלום' });
    expect(res.title).toBe('מיקוד שכיבות יהלום: עוצמה בבית');
  });

  it('returns null (never raw "@tag" text) when every row is unresolvable', async () => {
    state.ROWS.smartDescriptions = [
      { bundleId: 'gen_vacation_01', location: '', description: 'המטרה היא @סטטוס_נפח יציב גם בטיול.' },
    ];
    const res = await resolveWorkoutMetadata(strengthCtx);
    expect(res.description).toBeNull();
  });

  it('formerly-colliding tags resolve cleanly and the row is kept', async () => {
    state.ROWS.workoutTitles = [
      { bundleId: 'gen_park_pro_10', persona: 'any', location: 'home', text: 'אתגר @רמה_הבאה ב@מיקום' },
    ];
    const res = await resolveWorkoutMetadata({ ...strengthCtx, targetLevel: 8 });
    expect(res.title).toBe('אתגר רמה 8 בבית');
  });
});
