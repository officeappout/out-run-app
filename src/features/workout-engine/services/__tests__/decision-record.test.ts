import { describe, it, expect } from 'vitest';
import {
  buildDecisionRecord,
  computeWeeklyGap,
  pickSkillFocus,
  refreshDecisionExpect,
  REASON_RANK,
} from '../decision-record';
import { renderCoachNote, renderCoachNoteSentences, violatesVoice, fmtRest } from '../coach-note';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/workout-generator.types';

function ex(id: string, over: Partial<WorkoutExercise> = {}): WorkoutExercise {
  return {
    exercise: { id, name: { he: id }, targetPrograms: [] } as never,
    method: { location: 'home', gearIds: [] } as never,
    mechanicalType: 'bent_arm' as never,
    sets: 3,
    reps: 10,
    repsRange: { min: 8, max: 12 },
    isTimeBased: false,
    restSeconds: 90,
    priority: 'compound',
    score: 1,
    reasoning: [],
    exerciseRole: 'main',
    ...over,
  };
}

function workout(over: Partial<GeneratedWorkout> = {}): GeneratedWorkout {
  return {
    title: 'אימון',
    description: '',
    exercises: [
      ex('w1', { exerciseRole: 'warmup', sets: 1, restSeconds: 0 }),
      ex('a'),
      ex('b', { sets: 4, repsRange: { min: 6, max: 10 }, restSeconds: 120 }),
      ex('c'),
      ex('cd', { exerciseRole: 'cooldown', sets: 1 }),
    ],
    estimatedDuration: 32,
    structure: 'standard',
    difficulty: 2,
    mechanicalBalance: { straightArm: 0, bentArm: 3, hybrid: 0, ratio: '0:3', isBalanced: true },
    stats: { calories: 0, coins: 0, totalReps: 0, totalHoldTime: 0, difficultyMultiplier: 1 },
    isRecovery: false,
    totalPlannedSets: 12,
    ...over,
  };
}

describe('buildDecisionRecord', () => {
  it('expect: main exercises only, ranges from sets/reps/rest, intensity from difficulty', () => {
    const r = buildDecisionRecord(workout(), {});
    expect(r.expect).toMatchObject({
      structure: 'standard',
      protocol: 'straight',
      exercisesCount: 3,
      setsRange: { min: 3, max: 4 },
      repRange: { min: 8, max: 12, unit: 'reps' }, // typical (middle-half) range
      restRange: { min: 90, max: 120 },
      intensityWord: 'balanced',
      durationMin: 32,
    });
  });

  it('reasons are ranked RECOVERY > RETURNING > cycle > gap > skill > program > location > time > difficulty', () => {
    const r = buildDecisionRecord(workout(), {
      daysInactive: 9,
      policyReason: 'long_gap_deload',
      periodizationWeek: 5,
      weeklyGap: { domain: 'pull', pct: 60 },
      skillFocus: 'planche',
      programFocus: { program: 'full_body', level: 7 },
      location: 'home',
      timeOfDay: 'evening',
    });
    const codes = r.reasons.map((x) => x.code);
    expect(codes).toEqual(['RETURNING', 'WEEKLY_GAP', 'SKILL_FOCUS', 'PROGRAM_FOCUS', 'LOCATION', 'TIME', 'DIFFICULTY']);
    // long-gap forces week 5 — that's the RETURNING story, not a "deload week" one
    expect(codes).not.toContain('DELOAD_WEEK');
    const ranks = codes.map((c) => REASON_RANK.indexOf(c));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('recovery day suppresses training-story reasons', () => {
    const r = buildDecisionRecord(workout({ isRecovery: true }), {
      isRecoveryDay: true, daysInactive: 10, weeklyGap: { domain: 'push', pct: 50 }, location: 'home',
    });
    expect(r.reasons.map((x) => x.code)).toEqual(['RECOVERY_DAY', 'LOCATION']);
  });

  it('cycle weeks: deload, peak, build (build only with a real active cycle)', () => {
    expect(buildDecisionRecord(workout(), { policyReason: 'deload', periodizationWeek: 5 }).reasons[0])
      .toEqual({ code: 'DELOAD_WEEK', week: 5 });
    expect(buildDecisionRecord(workout(), { policyReason: 'peak', periodizationWeek: 4 }).reasons[0])
      .toEqual({ code: 'PEAK_WEEK', week: 4 });
    expect(buildDecisionRecord(workout(), { policyReason: 'build', periodizationWeek: 2, hasActiveCycle: true }).reasons[0])
      .toEqual({ code: 'BUILD_WEEK', week: 2 });
    expect(buildDecisionRecord(workout(), { policyReason: 'build', periodizationWeek: 1, hasActiveCycle: false })
      .reasons.map((x) => x.code)).not.toContain('BUILD_WEEK');
  });

  it('RETURNING needs a believable gap (4..365 days)', () => {
    expect(buildDecisionRecord(workout(), { daysInactive: 2 }).reasons.map((x) => x.code)).not.toContain('RETURNING');
    expect(buildDecisionRecord(workout(), { daysInactive: 900 }).reasons.map((x) => x.code)).not.toContain('RETURNING');
    expect(buildDecisionRecord(workout(), { daysInactive: 5, policyReason: 'detraining' }).reasons[0])
      .toEqual({ code: 'RETURNING', days: 5 });
  });

  it('protocol detection: tabata > emom > pyramid > superset/antagonist', () => {
    const tab = buildDecisionRecord(workout({
      tabataBlock: { config: { workSec: 20, restSec: 10, rounds: 8 }, exerciseIds: ['c'] },
    }));
    expect(tab.expect.protocol).toBe('tabata');
    expect(tab.expect.tabata).toEqual({ workSec: 20, restSec: 10, rounds: 8 });

    const w = workout();
    w.exercises[1].repsSequence = [12, 10, 8];
    expect(buildDecisionRecord(w).expect.protocol).toBe('pyramid');

    const p = workout();
    p.exercises[1].pairedWith = 'c';
    p.exercises[1].supersetType = 'staggered';
    expect(buildDecisionRecord(p).expect.protocol).toBe('antagonist');
    p.exercises[1].supersetType = 'compound';
    expect(buildDecisionRecord(p).expect.protocol).toBe('superset');
  });

  it('gear summary + level ceiling from the finished workout', () => {
    const w = workout({ pipelineLog: ['level_ceiling_clamp: pull L22→L18 (…)'] });
    w.exercises[2].method = { location: 'park', equipmentIds: ['bar'] } as never;
    const r = buildDecisionRecord(w, { location: 'park' });
    expect(r.reasons).toContainEqual({ code: 'LOCATION', loc: 'park', gearSummary: 'equipment' });
    expect(r.reasons.map((x) => x.code)).toContain('LEVEL_CEILING');
  });

  it('seed is stable per exercise list and differs across lists', () => {
    const a = buildDecisionRecord(workout()).seed;
    expect(buildDecisionRecord(workout()).seed).toBe(a);
    const other = workout();
    other.exercises[1] = ex('zzz');
    expect(buildDecisionRecord(other).seed).not.toBe(a);
  });

  it('record is plain JSON (survives the sessionStorage round-trip unchanged)', () => {
    const r = buildDecisionRecord(workout(), { location: 'home', timeOfDay: 'morning', daysInactive: 6 });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('refreshDecisionExpect re-derives expect from the current list, keeps reasons', () => {
    const w = workout();
    const r = buildDecisionRecord(w, { location: 'home' });
    w.exercises[1].sets = 5;
    const fresh = refreshDecisionExpect(r, w)!;
    expect(fresh.expect.setsRange).toEqual({ min: 3, max: 5 });
    expect(fresh.reasons).toBe(r.reasons);
  });
});

describe('computeWeeklyGap', () => {
  const budgets = [
    { domain: 'push', weekly: 20 },
    { domain: 'pull', weekly: 20 },
    { domain: 'legs', weekly: 10 },
  ];
  it('flags the domain clearly behind, as percent still missing', () => {
    expect(computeWeeklyGap(budgets, { push: 14, pull: 4, legs: 6 })).toEqual({ domain: 'pull', pct: 80 });
  });
  it('null at the start of the week (everyone equal) or without data', () => {
    expect(computeWeeklyGap(budgets, {})).toBeNull();
    expect(computeWeeklyGap(budgets, undefined)).toBeNull();
    expect(computeWeeklyGap([{ domain: 'push', weekly: 10 }], { push: 0 })).toBeNull();
  });
});

describe('pickSkillFocus', () => {
  it('only claims a skill the workout actually trains', () => {
    const w = workout();
    w.exercises[2].exercise.targetPrograms = [{ programId: 'pCI5NHXpowu2ySucqDn8', level: 4 }];
    const idToSlug = new Map([['pCI5NHXpowu2ySucqDn8', 'planche']]);
    expect(pickSkillFocus(w, ['front_lever', 'planche'], idToSlug)).toBe('planche');
    expect(pickSkillFocus(w, ['front_lever'], idToSlug)).toBeNull();
  });
});

describe('coach note', () => {
  const rich = () => buildDecisionRecord(workout(), {
    daysInactive: 6,
    policyReason: 'detraining',
    programFocus: { program: 'full_body', level: 7 },
    location: 'home',
    timeOfDay: 'evening',
  });

  it('2–4 sentences, voice-clean, numbers only from the record', () => {
    const record = rich();
    const s = renderCoachNoteSentences(record);
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s.length).toBeLessThanOrEqual(4);
    for (const line of s) expect(violatesVoice(line)).toBe(false);
    const text = s.join(' ');
    expect(text).toContain('6 ימים');
    const nums = (text.match(/\d+/g) ?? []).map(Number);
    // Every number must be in the record (rest may be shown in minutes).
    const recNums = (JSON.stringify(record).match(/\d+/g) ?? []).map(Number);
    const rest = record.expect.restRange!;
    const allowed = new Set([...recNums, Math.round(rest.min / 60), Math.round(rest.max / 60)]);
    for (const n of nums) expect(allowed.has(n)).toBe(true);
  });

  it('deterministic per record, and variant choice moves with the seed', () => {
    const r = rich();
    expect(renderCoachNote(r)).toBe(renderCoachNote(r));
    const seen = new Set<string>();
    for (let seed = 0; seed < 12; seed++) seen.add(renderCoachNote({ ...r, seed }));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('an unknown slug never leaks English — that sentence is dropped', () => {
    const r = buildDecisionRecord(workout(), { skillFocus: 'mystery_skill', location: 'home' });
    const text = renderCoachNote(r);
    expect(text).not.toMatch(/[A-Za-z]/);
    expect(text.length).toBeGreaterThan(0);
  });

  it('phrasebook override (future admin rows) replaces the defaults per key', () => {
    const r = rich();
    const text = renderCoachNote(r, { phrasebook: { RETURNING: ['חזרה אחרי {days} ימים.'] } });
    expect(text.startsWith('חזרה אחרי 6 ימים.')).toBe(true);
  });

  it('null / unknown version → empty', () => {
    expect(renderCoachNote(null)).toBe('');
    expect(renderCoachNote({ ...rich(), v: 2 as unknown as 1 })).toBe('');
  });

  it('rest formatting: seconds under 2 minutes, minutes above', () => {
    expect(fmtRest({ min: 60, max: 90 })).toBe('60 עד 90 שניות');
    expect(fmtRest({ min: 120, max: 180 })).toBe('2 עד 3 דקות');
    expect(fmtRest({ min: 90, max: 150 })).toBe('דקה וחצי עד 2 דקות וחצי');
    expect(fmtRest({ min: 105, max: 180 })).toBe('2 עד 3 דקות');
  });
});
