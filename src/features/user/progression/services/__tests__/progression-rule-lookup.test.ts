import { describe, it, expect, vi, beforeEach } from 'vitest';

// Progression-rule lookup bug: the admin panel saves progression_rules keyed by
// the program's Firestore DOC ID (`J0fLpmJhG0KDN2tQouxh_level_3`), but callers
// pass SLUGS (`push`) — so the old `${slug}_level_${n}` lookup always 404'd and
// DEFAULT_PROGRESSION_BY_LEVEL silently replaced every admin-tuned rule.
// Real ids/values below are the live public progression_rules docs.

const state = vi.hoisted(() => ({
  RULES: {} as Record<string, Record<string, unknown>>,
  reads: [] as string[],
  flag: true,
}));

// Live getter so each test can flip PROGRESSION_RULES_FROM_ADMIN_V1.
vi.mock('@/config/feature-flags', async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  return {
    ...orig,
    get PROGRESSION_RULES_FROM_ADMIN_V1() {
      return state.flag;
    },
  };
});

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  getDoc: vi.fn(async (ref: { col: string; id: string }) => {
    state.reads.push(`${ref.col}/${ref.id}`);
    const data = ref.col === 'progression_rules' ? state.RULES[ref.id] : undefined;
    return { exists: () => data !== undefined, data: () => data };
  }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: () => 'SERVER_TS',
  Timestamp: class FakeTimestamp {},
}));

const { PROGRAMS } = vi.hoisted(() => ({
  PROGRAMS: [
    { id: 'J0fLpmJhG0KDN2tQouxh', name: 'דחיפה', slug: 'push', movementPattern: 'push' },
    { id: 'UPDBtTdCvX748dtBlWYj', name: 'משיכה', slug: 'pull', movementPattern: 'pull' },
    { id: 'OrAmOH3F375dVio5yGdU', name: 'רגליים', slug: 'legs', movementPattern: 'legs' },
    { id: 'kDMpobbKsuVTByTIKUpe', name: 'ליבה', slug: 'core', movementPattern: 'core' },
  ],
}));

vi.mock('@/features/content/programs', () => ({
  getProgram: vi.fn(async () => null),
  getAllPrograms: vi.fn(async () => PROGRAMS),
  getProgramByTemplateId: vi.fn(async () => null),
  MASTER_PROGRAM_SLUG_TO_ID: {},
  MASTER_PROGRAM_ID_TO_SLUG: {},
}));

import {
  getProgressionRuleForLevel,
  progressionRuleIdCandidates,
  __resetProgressionRuleCacheForTests,
} from '../progression.service';
import { getAllPrograms } from '@/features/content/programs';

const slugMap = {
  idToSlug: new Map(PROGRAMS.map((p) => [p.id, p.slug])),
  slugToId: new Map(PROGRAMS.map((p) => [p.slug, p.id])),
  idToProgram: new Map(),
};

beforeEach(() => {
  state.RULES = {};
  state.reads = [];
  state.flag = true;
  vi.mocked(getAllPrograms).mockClear();
  __resetProgressionRuleCacheForTests();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('progressionRuleIdCandidates', () => {
  it('slug input → doc id first, slug fallback second', () => {
    expect(progressionRuleIdCandidates('push', 3, slugMap)).toEqual([
      'J0fLpmJhG0KDN2tQouxh_level_3',
      'push_level_3',
    ]);
  });

  it('doc id input → doc id first, slug fallback second', () => {
    expect(progressionRuleIdCandidates('UPDBtTdCvX748dtBlWYj', 13, slugMap)).toEqual([
      'UPDBtTdCvX748dtBlWYj_level_13',
      'pull_level_13',
    ]);
  });

  it('unknown program or no map → just the raw key (old behaviour)', () => {
    expect(progressionRuleIdCandidates('planche', 2, slugMap)).toEqual(['planche_level_2']);
    expect(progressionRuleIdCandidates('push', 2, null)).toEqual(['push_level_2']);
  });
});

describe('getProgressionRuleForLevel', () => {
  it('a slug caller now reads the admin rule stored under the doc id (was: defaults)', async () => {
    state.RULES['J0fLpmJhG0KDN2tQouxh_level_13'] = {
      baseSessionGain: 6, bonusPercent: 5, requiredSetsForFullGain: 10, linkedPrograms: [],
    };
    const rule = await getProgressionRuleForLevel('push', 13, slugMap);
    expect(rule).toEqual({
      baseSessionGain: 6, bonusPercent: 5, requiredSetsForFullGain: 10, linkedPrograms: [],
    });
    expect(state.reads[0]).toBe('progression_rules/J0fLpmJhG0KDN2tQouxh_level_13');
  });

  it('falls back to a slug-keyed doc when no doc-id rule exists', async () => {
    state.RULES['legs_level_2'] = { baseGain: 9, bonusPercent: 3, requiredSets: 7 };
    const rule = await getProgressionRuleForLevel('legs', 2, slugMap);
    expect(rule.baseSessionGain).toBe(9);
    expect(rule.requiredSetsForFullGain).toBe(7);
  });

  it('no rule anywhere → level defaults (unchanged behaviour)', async () => {
    const rule = await getProgressionRuleForLevel('core', 7, slugMap);
    expect(rule).toEqual({ baseSessionGain: 6, bonusPercent: 12, requiredSetsForFullGain: 6, linkedPrograms: [] });
  });

  it('builds the slug map itself when the caller has none', async () => {
    state.RULES['kDMpobbKsuVTByTIKUpe_level_1'] = { baseSessionGain: 15, bonusPercent: 5, requiredSetsForFullGain: 4 };
    const rule = await getProgressionRuleForLevel('core', 1);
    expect(rule.baseSessionGain).toBe(15);
    expect(getAllPrograms).toHaveBeenCalled();
  });

  it('caches a resolved rule — the second call does no Firestore reads', async () => {
    state.RULES['UPDBtTdCvX748dtBlWYj_level_5'] = { baseSessionGain: 8, bonusPercent: 5, requiredSetsForFullGain: 5 };
    await getProgressionRuleForLevel('pull', 5, slugMap);
    const readsAfterFirst = state.reads.length;
    const again = await getProgressionRuleForLevel('pull', 5, slugMap);
    expect(again.baseSessionGain).toBe(8);
    expect(state.reads.length).toBe(readsAfterFirst);
  });
});

describe('PROGRESSION_RULES_FROM_ADMIN_V1 off (default) — today\'s behaviour exactly', () => {
  it('single raw `${slug}_level_N` lookup: the doc-id rule is missed → defaults', async () => {
    state.flag = false;
    state.RULES['J0fLpmJhG0KDN2tQouxh_level_13'] = { baseSessionGain: 6, bonusPercent: 5, requiredSetsForFullGain: 10 };
    const rule = await getProgressionRuleForLevel('push', 13, slugMap);
    expect(rule).toEqual({ baseSessionGain: 4, bonusPercent: 15, requiredSetsForFullGain: 6, linkedPrograms: [] });
    expect(state.reads).toEqual([
      'progression_rules/push_level_13',
      'programLevelSettings/push_level_13',
    ]);
    expect(getAllPrograms).not.toHaveBeenCalled();
  });

  it('no cache while off — every call reads again', async () => {
    state.flag = false;
    await getProgressionRuleForLevel('pull', 5, slugMap);
    await getProgressionRuleForLevel('pull', 5, slugMap);
    expect(state.reads.filter((r) => r.startsWith('progression_rules/')).length).toBe(2);
  });
});
