import { describe, it, expect } from 'vitest';
import {
  bucketForProgressHub,
  resolveParentChildSlugs,
  averageParentLevel,
  isExcludedFromParentAverage,
  buildHubLevelsBySlug,
  discoverCardHint,
  type ProgressHubInput,
} from '../progress-hub-bucketing.service';

// Raw-id ↔ slug, the way real data mixes them.
const ID_TO_SLUG: Record<string, string> = {
  RAW_full_body: 'full_body',
  RAW_front_lever: 'front_lever',
  RAW_planche: 'planche',
  RAW_muscle_up: 'muscle_up',
  RAW_handstand: 'handstand',
  RAW_pull: 'pull',
};
const resolveSlug = (id: string) => ID_TO_SLUG[id] ?? id;
const HIDDEN = new Set(['muscle_up', 'handstand', 'human_flag']);
const isHidden = (id: string) => HIDDEN.has(id) || HIDDEN.has(resolveSlug(id));

const PARENTS: Record<string, string[]> = {
  full_body: ['push', 'pull', 'legs', 'core'],
  upper_body: ['push', 'pull'],
};
const childrenOf = (id: string) => PARENTS[resolveSlug(id)];

function input(overrides: Partial<ProgressHubInput>): ProgressHubInput {
  return {
    activeIds: [],
    trackLevels: {},
    levelsBySlug: {},
    childrenOf,
    catalog: [],
    gates: {},
    resolveSlug,
    isHidden,
    ...overrides,
  };
}

describe('bucketForProgressHub — "התוכניות שלי"', () => {
  it('active parent first ("primary"), then its assessed children, unassessed children go to needsAssessment', () => {
    const r = bucketForProgressHub(input({
      activeIds: ['RAW_full_body'],
      levelsBySlug: { push: 6, pull: 4, full_body: 5 },
      trackLevels: { push: 6, pull: 4, full_body: 5 },
    }));
    expect(r.mine.map((m) => [m.slug, m.role])).toEqual([
      ['full_body', 'primary'],
      ['push', 'child'],
      ['pull', 'child'],
    ]);
    expect(r.mine[1].parentId).toBe('RAW_full_body');
    expect(r.needsAssessment.map((n) => n.slug)).toEqual(['legs', 'core']);
    expect(r.needsAssessment[0].parentId).toBe('RAW_full_body');
  });

  it('then other active programs, then tracked sorted by level desc', () => {
    const r = bucketForProgressHub(input({
      activeIds: ['RAW_full_body', 'RAW_planche'],
      levelsBySlug: { push: 6, pull: 4, legs: 3, core: 2, planche: 2, front_lever: 3, oap: 9 },
      trackLevels: { push: 6, pull: 4, legs: 3, core: 2, RAW_planche: 2, RAW_front_lever: 3, oap: 9 },
    }));
    expect(r.mine.map((m) => [m.slug, m.role])).toEqual([
      ['full_body', 'primary'],
      ['push', 'child'],
      ['pull', 'child'],
      ['legs', 'child'],
      ['core', 'child'],
      ['planche', 'active'],
      ['oap', 'tracked'],
      ['front_lever', 'tracked'],
    ]);
    expect(r.needsAssessment).toEqual([]);
  });

  it('a program never appears twice (raw id and slug of the same program, or a child also active)', () => {
    const r = bucketForProgressHub(input({
      activeIds: ['RAW_full_body', 'full_body', 'pull'],
      levelsBySlug: { pull: 4 },
      trackLevels: { pull: 4, RAW_pull: 4 },
    }));
    const slugs = [...r.mine, ...r.needsAssessment].map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(r.mine.map((m) => m.slug)).toEqual(['full_body', 'pull']);
  });

  it('an unassessed active leaf goes to needsAssessment, without a parentId', () => {
    const r = bucketForProgressHub(input({ activeIds: ['RAW_planche'] }));
    expect(r.mine).toEqual([]);
    expect(r.needsAssessment).toEqual([{ programId: 'RAW_planche', slug: 'planche' }]);
  });

  it('tracked parents (a side effect of a child assessment) are not "mine" — they go to discover as parents', () => {
    const r = bucketForProgressHub(input({
      activeIds: ['pull'],
      levelsBySlug: { pull: 4, upper_body: 4 },
      trackLevels: { pull: 4, upper_body: 4 },
    }));
    expect(r.mine.map((m) => m.slug)).toEqual(['pull']);
    expect(r.discover).toEqual([{ programId: 'upper_body', slug: 'upper_body', kind: 'parent' }]);
  });
});

describe('bucketForProgressHub — hidden programs', () => {
  it('hidden programs are excluded from tracked and discover', () => {
    const r = bucketForProgressHub(input({
      trackLevels: { RAW_handstand: 3 },
      levelsBySlug: { handstand: 3 },
      catalog: ['RAW_muscle_up', 'RAW_handstand', 'RAW_front_lever'],
    }));
    expect(r.mine).toEqual([]);
    expect(r.discover.map((d) => d.slug)).toEqual(['front_lever']);
  });

  it('…except when the user has it ACTIVE', () => {
    const r = bucketForProgressHub(input({
      activeIds: ['RAW_muscle_up', 'RAW_handstand'],
      levelsBySlug: { muscle_up: 2 },
      trackLevels: { RAW_muscle_up: 2 },
      catalog: ['RAW_muscle_up', 'RAW_handstand'],
    }));
    expect(r.mine.map((m) => m.slug)).toEqual(['muscle_up']);
    expect(r.needsAssessment.map((m) => m.slug)).toEqual(['handstand']);
    expect(r.discover).toEqual([]);
  });
});

describe('bucketForProgressHub — "גלה עוד"', () => {
  it('orders needs-questionnaire only → locked → parents, catalog order within each group', () => {
    const r = bucketForProgressHub(input({
      catalog: ['RAW_full_body', 'RAW_front_lever', 'RAW_planche', 'oap', 'hspu'],
      gates: {
        RAW_front_lever: { status: 'needs_assessment', requirements: [{ domainProgramId: 'pull', need: 8 }] },
        RAW_planche: { status: 'locked_prereq', requirements: [{ domainProgramId: 'push', need: 10, have: 4 }] },
        oap: { status: 'available' },
      },
    }));
    expect(r.discover).toEqual([
      { programId: 'oap', slug: 'oap', kind: 'needs_questionnaire' },
      { programId: 'hspu', slug: 'hspu', kind: 'needs_questionnaire' },
      { programId: 'RAW_front_lever', slug: 'front_lever', kind: 'locked', missingDomainSlug: 'pull' },
      {
        programId: 'RAW_planche',
        slug: 'planche',
        kind: 'locked',
        requirements: [{ domainProgramId: 'push', need: 10 }],
      },
      { programId: 'RAW_full_body', slug: 'full_body', kind: 'parent' },
    ]);
  });

  it('excludes anything already in "mine" or "needsAssessment"', () => {
    const r = bucketForProgressHub(input({
      activeIds: ['full_body'],
      levelsBySlug: { push: 3 },
      trackLevels: { push: 3 },
      catalog: ['push', 'pull', 'RAW_full_body', 'RAW_front_lever'],
    }));
    expect(r.discover.map((d) => d.slug)).toEqual(['front_lever']);
  });

  it('empty profile: everything is discover, nothing mine', () => {
    const r = bucketForProgressHub(input({ catalog: ['RAW_front_lever', 'RAW_full_body'] }));
    expect(r.mine).toEqual([]);
    expect(r.needsAssessment).toEqual([]);
    expect(r.discover.map((d) => d.kind)).toEqual(['needs_questionnaire', 'parent']);
  });
});

describe('resolveParentChildSlugs', () => {
  it('uses Program.subPrograms when present (full_body includes core)', () => {
    expect(resolveParentChildSlugs('full_body', ['push', 'pull', 'legs', 'core'])).toEqual(['push', 'pull', 'legs', 'core']);
  });

  it('falls back to the engine list when subPrograms is empty / not loaded', () => {
    expect(resolveParentChildSlugs('full_body', undefined)).toEqual(['push', 'pull', 'legs', 'core']);
    expect(resolveParentChildSlugs('upper_body', [])).toEqual(['push', 'pull']);
  });

  it('calisthenics_upper: skillFocusIds first, else subPrograms without the foundational domains', () => {
    expect(resolveParentChildSlugs('calisthenics_upper', ['pull', 'front_lever', 'planche'], ['planche'])).toEqual(['planche']);
    expect(resolveParentChildSlugs('calisthenics_upper', ['pull', 'push', 'front_lever', 'planche'], [])).toEqual(['front_lever', 'planche']);
  });

  it('drops duplicates and the parent itself', () => {
    expect(resolveParentChildSlugs('lower_body', ['legs', 'legs', 'lower_body'])).toEqual(['legs']);
  });

  it('an unknown program with no subPrograms has no children', () => {
    expect(resolveParentChildSlugs('planche', undefined)).toEqual([]);
  });
});

describe('averageParentLevel', () => {
  it('rounded mean of assessed children, core excluded for full_body, capped at 15', () => {
    expect(isExcludedFromParentAverage('full_body', 'core')).toBe(true);
    expect(averageParentLevel('full_body', ['push', 'pull', 'legs', 'core'], { push: 6, pull: 3, core: 20 })).toBe(5);
    expect(averageParentLevel('full_body', ['push', 'pull'], { push: 20, pull: 18 })).toBe(15);
  });

  it('null when no child has a level', () => {
    expect(averageParentLevel('upper_body', ['push', 'pull'], {})).toBeNull();
  });
});

describe('buildHubLevelsBySlug', () => {
  it('tracks first (slug-normalized, > 0 only), progression.domains fills gaps', () => {
    expect(
      buildHubLevelsBySlug(
        { RAW_pull: { currentLevel: 4 }, push: { currentLevel: 0 } },
        { pull: { currentLevel: 9 }, push: 3, legs: { level: 2 }, core: undefined },
        resolveSlug,
      ),
    ).toEqual({ pull: 4, push: 3, legs: 2 });
  });
});

describe('discoverCardHint', () => {
  it('needs_questionnaire → "בדקו רמה" on the program itself', () => {
    expect(discoverCardHint({ programId: 'oap', slug: 'oap', kind: 'needs_questionnaire' })).toEqual({
      lockedHint: 'בדקו רמה',
      assessSlug: 'oap',
    });
  });

  it('missing prerequisite → the CTA assesses the missing DOMAIN, not the skill', () => {
    expect(
      discoverCardHint({ programId: 'RAW_front_lever', slug: 'front_lever', kind: 'locked', missingDomainSlug: 'pull' }),
    ).toEqual({ lockedHint: 'קודם בודקים רמה במשיכה', assessSlug: 'pull' });
  });

  it('prerequisite too low → informational hint, no CTA', () => {
    expect(
      discoverCardHint({
        programId: 'RAW_muscle_up',
        slug: 'muscle_up',
        kind: 'locked',
        requirements: [{ domainProgramId: 'push', need: 10 }, { domainProgramId: 'pull', need: 10 }],
      }),
    ).toEqual({ lockedHint: 'דרוש דחיפה 10 ומשיכה 10' });
  });

  it('parent → nothing', () => {
    expect(discoverCardHint({ programId: 'full_body', slug: 'full_body', kind: 'parent' })).toEqual({});
  });
});
