import { describe, it, expect } from 'vitest';
import type { Exercise, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import {
  buildDensityBlock,
  densityReps,
  isDensityEligible,
  isSingleDomainSession,
  partitionByDensityBlock,
  type DensityDomain,
} from '../density-block';
import { withTimedMainBlock } from '../timed.block';

const MG: Record<DensityDomain, string> = { push: 'horizontal_push', pull: 'vertical_pull', legs: 'squat', core: 'core' };
let n = 0;
function ex(name: string, domain: DensityDomain, level: number, extra: Partial<Exercise> = {}): Exercise {
  return {
    id: `ex${++n}`,
    name: { he: name, en: name },
    type: 'reps',
    movementGroup: MG[domain],
    targetPrograms: [{ programId: domain, level }],
    secondsPerRep: 3,
    ...extra,
  } as unknown as Exercise;
}
const cand = (e: Exercise) => ({ exercise: e, method: {} as ExecutionMethod });
const levels = (m: Partial<Record<DensityDomain, number>>) => (d: DensityDomain) => m[d] ?? 1;
const rand0 = () => 0;

const POOL = [
  ex('שכיבות סמיכה', 'push', 5),
  ex('שכיבות סמיכה יהלום', 'push', 8),
  ex('מקבילים', 'push', 10),
  ex('החזקת מקבילים', 'push', 5),
  ex('שכיבות סמיכה קשתים', 'push', 14),
  ex('מתח סופינציה', 'pull', 10),
  ex('מתח', 'pull', 11),
  ex('מתח אוסטרלי ב-15° מעלות', 'pull', 5),
  ex('מתח אקצנטרי', 'pull', 8),
  ex('סקוואט קפיצה', 'legs', 3),
  ex('מטפס הרים', 'core', 4),
].map(cand);

describe('isDensityEligible', () => {
  it('dynamic reps only: no holds, eccentrics, bands, skills, timed', () => {
    expect(isDensityEligible(ex('שכיבות סמיכה', 'push', 5), 'emom')).toBe(true);
    expect(isDensityEligible(ex('החזקת מתח ב-90°', 'pull', 7), 'emom')).toBe(false);
    expect(isDensityEligible(ex('מתח אקצנטרי', 'pull', 8), 'emom')).toBe(false);
    expect(isDensityEligible(ex('מתח עם גומייה דקה', 'pull', 9), 'emom')).toBe(false);
    expect(isDensityEligible(ex('פיסטול סקוואט שלילי ימין', 'legs', 8), 'emom')).toBe(false);
    expect(isDensityEligible(ex('שכיבות סמיכה שיפוע שלילי', 'push', 10), 'emom')).toBe(true);
    expect(isDensityEligible(ex('שכיבות סמיכה פסודו פלאנץ׳', 'push', 15), 'emom')).toBe(false);
    expect(isDensityEligible(ex('פלאנק', 'core', 2, { type: 'time' } as Partial<Exercise>), 'emom')).toBe(false);
  });
  it('explosive moves: EMOM yes, AMRAP no', () => {
    const e = ex('מתח מתפרץ', 'pull', 13);
    expect(isDensityEligible(e, 'emom')).toBe(true);
    expect(isDensityEligible(e, 'amrap')).toBe(false);
  });
});

describe('densityReps', () => {
  it('bigger level gap → more reps; one domain ≈60%; EMOM fits 40 s', () => {
    const b = { symmetry: 'bilateral', secondsPerRep: 2 } as const;
    expect(densityReps(b, 2, 'amrap', false)).toBe(6);
    expect(densityReps(b, 6, 'amrap', false)).toBe(16);
    expect(densityReps(b, 2, 'emom', true)).toBe(5); // one-domain EMOM floor
    expect(densityReps({ symmetry: 'bilateral', secondsPerRep: 5 }, 6, 'emom', false)).toBe(8);
    expect(densityReps({ symmetry: 'unilateral', secondsPerRep: 2 }, 6, 'amrap', false)).toBe(11);
  });
});

describe('isSingleDomainSession', () => {
  it('core alongside one strength domain is still single', () => {
    expect(isSingleDomainSession(['pull', 'core'])).toBe(true);
    expect(isSingleDomainSession(['push', 'pull'])).toBe(false);
  });
});

describe('buildDensityBlock', () => {
  it('multi-domain: 3-5 members, every one ≥2 levels below its domain', () => {
    const r = buildDensityBlock({
      format: 'emom', sessionDomains: ['push', 'pull', 'core'], domainLevels: levels({ push: 14, pull: 12, core: 8 }),
      pool: POOL, headroomMinutes: 15, excludeIds: new Set(), rand: rand0,
    })!;
    expect(r.spec.format).toBe('emom');
    expect(r.members.length).toBeGreaterThanOrEqual(3);
    expect(r.members.length).toBeLessThanOrEqual(5);
    expect(r.spec.minutes % r.members.length).toBe(0);
    expect(r.spec.minutes).toBeGreaterThanOrEqual(8);
    expect(r.spec.minutes).toBeLessThanOrEqual(12);
    for (const m of r.members) {
      expect(m.protocolBlock).toBe('density');
      expect(m.reasoning.some((x) => /level_gap:(\d+)/.test(x) && Number(x.split(':')[1]) >= 2)).toBe(true);
    }
    const names = r.members.map((m) => (m.exercise.name as { he: string }).he);
    expect(names).not.toContain('שכיבות סמיכה קשתים'); // at the user's level
    expect(names).not.toContain('החזקת מקבילים');
  });

  it('one domain: AMRAP becomes EMOM, 1-2 exercises 2-3 levels below, 8-10 min', () => {
    const r = buildDensityBlock({
      format: 'amrap', sessionDomains: ['pull'], domainLevels: levels({ pull: 12 }),
      pool: POOL, headroomMinutes: 20, excludeIds: new Set(), rand: rand0,
    })!;
    expect(r.spec.format).toBe('emom');
    expect(r.spec.singleDomain).toBe(true);
    expect(r.members.length).toBeLessThanOrEqual(2);
    expect(r.spec.minutes).toBeLessThanOrEqual(10);
    for (const m of r.members) expect(['מתח סופינציה', 'מתח']).toContain((m.exercise.name as { he: string }).he);
  });

  it('AMRAP keeps full pull-ups out below pull 14 (rows instead)', () => {
    const r = buildDensityBlock({
      format: 'amrap', sessionDomains: ['push', 'pull'], domainLevels: levels({ push: 12, pull: 13 }),
      pool: POOL, headroomMinutes: 10, excludeIds: new Set(), rand: rand0,
    });
    const names = (r?.members ?? []).map((m) => (m.exercise.name as { he: string }).he);
    expect(names.filter((x) => x.startsWith('מתח') && !x.includes('אוסטרלי'))).toEqual([]);
  });

  it('too few eligible or no time → null', () => {
    expect(buildDensityBlock({
      format: 'emom', sessionDomains: ['push', 'pull'], domainLevels: levels({ push: 3, pull: 3 }),
      pool: POOL, headroomMinutes: 15, excludeIds: new Set(), rand: rand0,
    })).toBeNull();
    expect(buildDensityBlock({
      format: 'emom', sessionDomains: ['push', 'pull', 'core'], domainLevels: levels({ push: 14, pull: 12, core: 8 }),
      pool: POOL, headroomMinutes: 6, excludeIds: new Set(), rand: rand0,
    })).toBeNull();
  });

  it('never repeats an exercise already in the session', () => {
    const first = POOL.find((c) => (c.exercise.name as { he: string }).he === 'מתח סופינציה')!.exercise.id;
    const r = buildDensityBlock({
      format: 'emom', sessionDomains: ['pull'], domainLevels: levels({ pull: 13 }),
      pool: POOL, headroomMinutes: 10, excludeIds: new Set([first]), rand: rand0,
    })!;
    expect(r.members.map((m) => m.exercise.id)).not.toContain(first);
  });
});

describe('mapper split', () => {
  it('seg-main keeps the classic exercises; seg-density right after carries the timed block', () => {
    const segs = [
      { id: 'seg-warmup', exercises: [{ id: 'w' }] },
      { id: 'seg-main', exercises: [{ id: 'a' }, { id: 'b' }, { id: 'd1' }, { id: 'd2' }, { id: 'd3' }] },
    ];
    const gw = { structure: 'emom', exercises: ['d1', 'd2', 'd3'].map((id) => ({ exercise: { id }, protocolBlock: 'density' })), densityBlock: { format: 'emom', minutes: 9, exerciseIds: ['d1', 'd2', 'd3'], singleDomain: false } } as never;
    const out = withTimedMainBlock(segs, gw) as Array<{ id: string; exercises: Array<{ id: string }>; protocol?: string }>;
    expect(out.map((s) => s.id)).toEqual(['seg-warmup', 'seg-main', 'seg-density']);
    expect(out[1].exercises.map((e) => e.id)).toEqual(['a', 'b']);
    expect(out[1].protocol).toBeUndefined();
    expect(out[2].protocol).toBe('emom');
    expect(out[2].exercises.map((e) => e.id)).toEqual(['d1', 'd2', 'd3']);
  });

  it('block members gone from the workout → seg-main untouched', () => {
    const segs = [{ id: 'seg-main', exercises: [{ id: 'a' }] }];
    const gw = { structure: 'emom', exercises: [], densityBlock: { format: 'emom', minutes: 9, exerciseIds: ['d1'], singleDomain: true } } as never;
    expect(withTimedMainBlock(segs, gw)).toBe(segs);
  });

  it('partition with no members found leaves everything classic', () => {
    expect(partitionByDensityBlock([{ id: 'a' }], { format: 'emom', minutes: 8, exerciseIds: ['x'], singleDomain: true }))
      .toEqual({ density: [], rest: [{ id: 'a' }] });
  });
});
