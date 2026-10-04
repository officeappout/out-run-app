import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stage 6 fix (program-identity audit §05-B / §06 stage 6): buildProgramSlugMap
// (progression.service.ts, private) built its hash→slug map as
// `movementPattern || name-derived`, omitting Program.slug entirely — the
// OPPOSITE priority of the canonical resolver and of Program.slug's own doc
// comment ("Takes priority over movementPattern and name-derived slugs").
//
// calisthenics_upper's real subPrograms (tests/invariants/fixtures/programs.json)
// mix 3 foundational children with movementPattern set (push/pull/core) and 4
// skill children with movementPattern=null, slug-only (planche/front_lever/
// one_arm_pullup/handstand_pushup). Under the old priority, a skill child's
// garbled Hebrew-name-derived "slug" never matched its real tracks.{slug}
// entry — isConfigured came back false for a genuinely-assessed skill, so
// configuredChildIds only ever picked up the (Tier-3-excluded) foundational
// matches, producing avgChildren.length===0 && configuredChildIds.size>0 →
// routingEmptySkip:true → recalculateMasterLevel aborts the write entirely.
//
// This test reproduces that exact shape with REAL fixture ids/slugs (not
// synthetic ones) and asserts the fix actually unblocks a CORRECT level —
// not just that the abort stops firing.
//
// No shared Firestore test-utils helper exists in this repo (confirmed via
// onboarding-sync.service.test.ts's own comment) — same inline vi.mock
// convention as that file.

const state = vi.hoisted(() => ({
  USER_DOC: null as Record<string, any> | null,
}));

const updateDocMock = vi.hoisted(() =>
  vi.fn<(ref: unknown, data: Record<string, unknown>) => Promise<undefined>>(async () => undefined));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: (_db: unknown, _col: string, uid: string) => ({ __uid: uid }),
  getDoc: vi.fn(async () => ({
    exists: () => state.USER_DOC !== null,
    data: () => state.USER_DOC ?? undefined,
  })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  updateDoc: updateDocMock,
  serverTimestamp: () => 'SERVER_TS',
  Timestamp: class FakeTimestamp {
    constructor(public ms: number) {}
    static now() { return new FakeTimestamp(Date.now()); }
  },
}));

// Real fixture shape (tests/invariants/fixtures/programs.json) — calisthenics_upper
// and its 7 real subPrograms, byte-for-byte id/slug/movementPattern/name.
// vi.hoisted: vi.mock factories below are hoisted above all other top-level
// code, so these fixtures must be too, or the factory sees them as
// uninitialized (same convention as `state`/`updateDocMock` above).
const { CALISTHENICS_UPPER, UPPER_BODY, FULL_BODY, CHILD_PROGRAMS, ALL_PROGRAMS } = vi.hoisted(() => {
  const CALISTHENICS_UPPER = {
    id: 'JCac76p48XGZ5MVahLI2', name: 'קליסטניקס עליון', isMaster: true, maxLevels: 15,
    slug: 'calisthenics_upper',
    subPrograms: [
      'mFcuYlNgKXLqWVUFo0zt', // front_lever
      'pCI5NHXpowu2ySucqDn8', // planche
      'cC0BOmm6KIqYAyQynEIo', // one_arm_pullup
      'kDMpobbKsuVTByTIKUpe', // core
      'PAxprHuT7HjqrWU4wl0T', // handstand_pushup
      'J0fLpmJhG0KDN2tQouxh', // push
      'UPDBtTdCvX748dtBlWYj', // pull
    ],
  };
  // Real ids (program.service.ts's MASTER_PROGRAM_SLUG_TO_ID / tests/invariants
  // fixtures/programs.json). upper_body's subPrograms are flat real leaf
  // hashes (push, pull) — matches production exactly. full_body's REAL
  // subPrograms array nests through the slug string 'upper_body' (multi-level
  // recursion) rather than a flat leaf list; this test uses a flat
  // push/pull/legs/core variant instead — recursion correctness is a
  // pre-existing, separate concern from Stage 7's write-boundary fix, which
  // is all this describe block verifies.
  const UPPER_BODY = {
    id: '47smw26hUyG5ZbE1bhr3', name: 'פלג גוף עליון', isMaster: true, maxLevels: 25,
    slug: 'upper_body',
    subPrograms: ['J0fLpmJhG0KDN2tQouxh', 'UPDBtTdCvX748dtBlWYj'], // push, pull
  };
  const FULL_BODY = {
    id: 'H2279XsRGDg9G370J7S9', name: 'כל הגוף', isMaster: true, maxLevels: 15,
    slug: 'full_body',
    subPrograms: [
      'J0fLpmJhG0KDN2tQouxh', // push
      'UPDBtTdCvX748dtBlWYj', // pull
      'OrAmOH3F375dVio5yGdU', // legs
      'kDMpobbKsuVTByTIKUpe', // core — excluded from full_body's average (EXCLUDED_FROM_AVG)
    ],
  };
  const CHILD_PROGRAMS: Record<string, any> = {
    J0fLpmJhG0KDN2tQouxh: { id: 'J0fLpmJhG0KDN2tQouxh', name: 'דחיפה', slug: 'push', movementPattern: 'push', isMaster: false },
    UPDBtTdCvX748dtBlWYj: { id: 'UPDBtTdCvX748dtBlWYj', name: 'משיכה', slug: 'pull', movementPattern: 'pull', isMaster: false },
    kDMpobbKsuVTByTIKUpe: { id: 'kDMpobbKsuVTByTIKUpe', name: 'ליבה', slug: 'core', movementPattern: 'core', isMaster: false },
    OrAmOH3F375dVio5yGdU: { id: 'OrAmOH3F375dVio5yGdU', name: 'פלג גוף תחתון', slug: 'legs', movementPattern: 'legs', isMaster: false },
    mFcuYlNgKXLqWVUFo0zt: { id: 'mFcuYlNgKXLqWVUFo0zt', name: 'פרונט לבר', slug: 'front_lever', movementPattern: null, isMaster: false },
    pCI5NHXpowu2ySucqDn8: { id: 'pCI5NHXpowu2ySucqDn8', name: 'פלאנץ׳', slug: 'planche', movementPattern: null, isMaster: false },
    cC0BOmm6KIqYAyQynEIo: { id: 'cC0BOmm6KIqYAyQynEIo', name: 'מתח יד אחת', slug: 'one_arm_pullup', movementPattern: null, isMaster: false },
    PAxprHuT7HjqrWU4wl0T: { id: 'PAxprHuT7HjqrWU4wl0T', name: 'שכיבות סמיכה בעמידת ידיים', slug: 'handstand_pushup', movementPattern: null, isMaster: false },
  };
  const ALL_PROGRAMS = [CALISTHENICS_UPPER, UPPER_BODY, FULL_BODY, ...Object.values(CHILD_PROGRAMS)];
  return { CALISTHENICS_UPPER, UPPER_BODY, FULL_BODY, CHILD_PROGRAMS, ALL_PROGRAMS };
});

const MASTERS_BY_ID: Record<string, any> = {
  [CALISTHENICS_UPPER.id]: CALISTHENICS_UPPER,
  [UPPER_BODY.id]: UPPER_BODY,
  [FULL_BODY.id]: FULL_BODY,
};

vi.mock('@/features/content/programs', () => ({
  getProgram: vi.fn(async (id: string) => MASTERS_BY_ID[id] ?? CHILD_PROGRAMS[id] ?? null),
  getAllPrograms: vi.fn(async () => ALL_PROGRAMS),
  getProgramByTemplateId: vi.fn(async () => null),
  MASTER_PROGRAM_SLUG_TO_ID: {
    calisthenics_upper: CALISTHENICS_UPPER.id,
    upper_body: UPPER_BODY.id,
    full_body: FULL_BODY.id,
  },
  MASTER_PROGRAM_ID_TO_SLUG: {
    [CALISTHENICS_UPPER.id]: 'calisthenics_upper',
    [UPPER_BODY.id]: 'upper_body',
    [FULL_BODY.id]: 'full_body',
  },
}));

/**
 * program-hierarchy.utils.ts (the canonical resolveToSlug/ensureIdSlugMapWarm
 * this test's recalculateMasterLevel calls) imports getAllPrograms from
 * '@/features/content/programs/core/program.service' directly — a DIFFERENT
 * module specifier than the '@/features/content/programs' barrel mocked
 * above, so it is NOT intercepted by that mock. It falls through to the
 * real program.service.ts, which in turn calls the mocked firebase/firestore
 * below (getDocs → {docs: []}) — so resolveToSlug's backing map ends up
 * built-but-empty, and resolveToSlug legitimately misses every id here.
 * That's fine: recalculateMasterLevel's fallback to MASTER_PROGRAM_ID_TO_SLUG
 * (mocked above) is exactly the path these tests exercise, and real callers
 * get a real, populated map from a real getAllPrograms() the same way Stage
 * 6's test file already established for buildProgramSlugMap. Not mocking
 * program.service.ts itself to avoid duplicating two parallel fixture sets
 * for what both end up resolving as the same static-map fallback here.
 */

beforeEach(() => {
  state.USER_DOC = null;
  updateDocMock.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

import { getMasterProgramProgress, recalculateMasterLevel } from '../progression.service';

describe('Stage 6 fix — calisthenics_upper: skill children resolve, abort stops firing, correct level persists', () => {
  // Real assessed skill tracks under their CORRECT slug keys, plus a real
  // foundational push track (SKILL_TO_FOUNDATION_OFFSET-derived, as a real
  // calisthenics_upper user would have) — no skillFocusIds/focusDomains set,
  // so Tier 3 (foundational exclusion only) is what's under test.
  function userWithRealSkillTracks() {
    return {
      progression: {
        tracks: {
          push: { currentLevel: 5, percent: 0 },
          planche: { currentLevel: 6, percent: 0 },
          front_lever: { currentLevel: 8, percent: 0 },
        },
        domains: {},
        activePrograms: [],
      },
    };
  }

  it('resolves planche/front_lever to their real slugs and computes the correct average level — fails pre-fix (routingEmptySkip:true, displayLevel:0), confirmed by reverting progression.service.ts and re-running this file', async () => {
    state.USER_DOC = userWithRealSkillTracks();
    const progress = await getMasterProgramProgress('test-uid', CALISTHENICS_UPPER.id);

    expect(progress).not.toBeNull();
    expect(progress?.routingEmptySkip).not.toBe(true);
    // avg(planche=6, front_lever=8) = 7 — push is correctly EXCLUDED
    // (foundational, Tier 3), planche/front_lever correctly INCLUDED.
    expect(progress?.displayLevel).toBe(7);
  });

  it('recalculateMasterLevel persists the computed level 7 — no ABORTED log, a real Firestore write happens', async () => {
    state.USER_DOC = userWithRealSkillTracks();
    const result = await recalculateMasterLevel('test-uid', CALISTHENICS_UPPER.id);

    expect(result).not.toBeNull();
    expect(result?.level).toBe(7);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const written = updateDocMock.mock.calls[0][1] as Record<string, unknown>;
    // Stage 7 fix (program-identity audit §06): slug key only, no hash key —
    // this used to assert BOTH keys were written (the confirmed dual-write
    // bug Stage 7 fixes); updated here rather than in a separate describe
    // block since it's the same call this test already exercises.
    expect(written['progression.tracks.calisthenics_upper.currentLevel']).toBe(7);
    expect(written[`progression.tracks.${CALISTHENICS_UPPER.id}.currentLevel`]).toBeUndefined();

    const warnCalls = (console.warn as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(warnCalls.some((m: string) => m.includes('ABORTED write'))).toBe(false);
  });

  it('a master with ONLY foundational children configured (no real skill assessment at all) still correctly aborts — the fix does not disable the safety net for the genuine case', async () => {
    // No skill tracks at all — only push. Tier 3 excludes push (foundational),
    // leaving avgChildren empty while configuredChildIds has 'push' — this
    // IS the legitimate "routing/config mismatch, preserve existing" case
    // the abort exists to protect, confirmed separately from this bug.
    state.USER_DOC = {
      progression: {
        tracks: { push: { currentLevel: 5, percent: 0 } },
        domains: {},
        activePrograms: [],
      },
    };
    const progress = await getMasterProgramProgress('test-uid', CALISTHENICS_UPPER.id);
    expect(progress?.routingEmptySkip).toBe(true);

    const result = await recalculateMasterLevel('test-uid', CALISTHENICS_UPPER.id);
    expect(result).toBeNull();
    expect(updateDocMock).not.toHaveBeenCalled();
  });
});

describe('Stage 7 fix — recalculateMasterLevel writes ONLY the slug key, never the raw hash', () => {
  it('upper_body: writes progression.tracks.upper_body, never progression.tracks.<hash>', async () => {
    state.USER_DOC = {
      progression: {
        tracks: {
          push: { currentLevel: 5, percent: 0 },
          pull: { currentLevel: 7, percent: 0 },
        },
        domains: {},
        activePrograms: [],
      },
    };

    const result = await recalculateMasterLevel('test-uid', UPPER_BODY.id);

    // avg(push=5, pull=7) = 6 — no EXCLUDED_FROM_AVG entry for upper_body.
    expect(result).not.toBeNull();
    expect(result?.level).toBe(6);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const written = updateDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(written['progression.tracks.upper_body.currentLevel']).toBe(6);
    expect(written['progression.domains.upper_body.currentLevel']).toBe(6);
    expect(written[`progression.tracks.${UPPER_BODY.id}.currentLevel`]).toBeUndefined();
    expect(written[`progression.domains.${UPPER_BODY.id}.currentLevel`]).toBeUndefined();
  });

  it('full_body: writes progression.tracks.full_body, never progression.tracks.<hash> — core correctly excluded from the average', async () => {
    state.USER_DOC = {
      progression: {
        tracks: {
          push: { currentLevel: 10, percent: 0 },
          pull: { currentLevel: 12, percent: 0 },
          legs: { currentLevel: 8, percent: 0 },
          core: { currentLevel: 20, percent: 0 }, // excluded — would skew the average if it leaked in
        },
        domains: {},
        activePrograms: [],
      },
    };

    const result = await recalculateMasterLevel('test-uid', FULL_BODY.id);

    // avg(push=10, pull=12, legs=8) = 10 — core (20) excluded per EXCLUDED_FROM_AVG.full_body.
    expect(result).not.toBeNull();
    expect(result?.level).toBe(10);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const written = updateDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(written['progression.tracks.full_body.currentLevel']).toBe(10);
    expect(written[`progression.tracks.${FULL_BODY.id}.currentLevel`]).toBeUndefined();
  });
});
