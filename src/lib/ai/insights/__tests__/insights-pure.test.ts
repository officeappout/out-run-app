/**
 * Workout insights — pure parts: bodyweight volume, the prompt builder (no PII), the line guard.
 */
import { describe, it, expect } from 'vitest';
import { bodyweightVolumeKg, funnyComparisons, loadFactorFor, usableBodyweightKg } from '../volume';
import { INSIGHT_SYSTEM, insightFacts, insightUserContent } from '../prompt';
import { parseInsightReply, validateInsightLine } from '../lines-guard';
import { WorkoutInsightRequestSchema, type WorkoutInsightRequest } from '../schema';
import { workoutInsightsOnFor } from '../gate';

describe('loadFactorFor', () => {
  it('maps the owner reference factors', () => {
    expect(loadFactorFor('מתח')).toBe(1.0);
    expect(loadFactorFor('מקבילים')).toBe(1.0);
    expect(loadFactorFor('שכיבות סמיכה')).toBe(0.64);
    expect(loadFactorFor('סקוואט')).toBe(0.7);
    expect(loadFactorFor('Pull-Up')).toBe(1.0);
  });
  it('specific variants win over the generic name', () => {
    expect(loadFactorFor('שכיבות סמיכה על הברכיים')).toBe(0.49);
    expect(loadFactorFor('מתח אוסטרלי')).toBe(0.55);
  });
  it('unknown / empty → 0 (no invented weight)', () => {
    expect(loadFactorFor('פלאנק')).toBe(0);
    expect(loadFactorFor('')).toBe(0);
    expect(loadFactorFor(undefined)).toBe(0);
  });
});

describe('bodyweightVolumeKg', () => {
  const ex = [
    { name: 'מתח', unit: 'reps' as const, sets: [10, 8, 7] }, // 25 × 80 × 1.0 = 2000
    { name: 'שכיבות סמיכה', unit: 'reps' as const, sets: [20, 20] }, // 40 × 80 × 0.64 = 2048
    { name: 'פלאנק', unit: 'seconds' as const, sets: [60] }, // timed → 0
  ];
  it('reps × bodyweight × factor, rounded to 10 kg', () => {
    expect(bodyweightVolumeKg(ex, 80)).toBe(4050);
  });
  it('no usable bodyweight → null', () => {
    expect(bodyweightVolumeKg(ex, undefined)).toBeNull();
    expect(bodyweightVolumeKg(ex, 0)).toBeNull();
    expect(bodyweightVolumeKg(ex, 900)).toBeNull();
    expect(usableBodyweightKg('72')).toBe(72);
  });
  it('only timed / unknown work → null', () => {
    expect(bodyweightVolumeKg([{ name: 'פלאנק', unit: 'seconds', sets: [60] }], 80)).toBeNull();
    expect(bodyweightVolumeKg([{ name: 'ריקוד', unit: 'reps', sets: [10] }], 80)).toBeNull();
  });
  it('funny comparisons are computed, not left to the model', () => {
    expect(funnyComparisons(3200)).toContain('32 גורי פילים');
    expect(funnyComparisons(null)).toEqual([]);
  });
});

const REQ: WorkoutInsightRequest = WorkoutInsightRequestSchema.parse({
  key: 's:abc:def',
  kind: 'strength',
  durationSec: 1860,
  exercises: [
    { name: 'מתח', unit: 'reps', sets: [10, 8, 0], improvedBy: 2 },
    { name: 'פלאנק', unit: 'seconds', sets: [45] },
  ],
  level: { before: 4, after: 4, gainPercent: 9, leveledUp: false },
});

describe('prompt builder', () => {
  it('builds facts from the workout only', () => {
    const facts = insightFacts(REQ, 3200);
    expect(facts).toContain('duration: 31 minutes');
    expect(facts.join('\n')).toContain('exercise "מתח": 2 sets (10, 8 reps), +2 reps vs last time');
    expect(facts.join('\n')).toContain('level progress: +9% toward level 5');
    expect(facts.join('\n')).toContain('3,200 kg');
    expect(facts.join('\n')).toContain('32 גורי פילים');
  });
  it('carries no PII: no name, uid, email, bodyweight or location', () => {
    const content = insightUserContent(REQ, 'female', 3200);
    expect(content).toContain('feminine singular');
    for (const pii of ['uid', 'email', 'name:', 'weight:', 'bodyweight:', 'city', 'park']) {
      expect(content.toLowerCase()).not.toContain(pii);
    }
    expect(INSIGHT_SYSTEM).toContain('JSON only');
  });
  it('the schema refuses markup / injection characters and unknown shapes', () => {
    expect(WorkoutInsightRequestSchema.safeParse({ ...REQ, exercises: [{ name: '<script>', unit: 'reps', sets: [1] }] }).success).toBe(false);
    expect(WorkoutInsightRequestSchema.safeParse({ ...REQ, key: 'a b' }).success).toBe(false);
    expect(WorkoutInsightRequestSchema.safeParse({ ...REQ, durationSec: -1 }).success).toBe(false);
  });
});

describe('line guard', () => {
  const facts = insightFacts(REQ, 3200).join('\n');
  it('keeps a clean Hebrew line and closes it with a period', () => {
    expect(validateInsightLine('כל הכבוד, פלג הגוף העליון עבד חזק היום', 'male', facts)).toBe('כל הכבוד, פלג הגוף העליון עבד חזק היום.');
  });
  it('allows numbers only from the facts', () => {
    expect(validateInsightLine('הרמת היום כ־3,200 ק״ג, 32 גורי פילים!', 'male', facts)).not.toBeNull();
    expect(validateInsightLine('הרמת היום 5,000 ק״ג!', 'male', facts)).toBeNull();
  });
  it('drops questions, Latin, emoji, slash forms and wrong gender', () => {
    expect(validateInsightLine('מה דעתך על האימון?', 'male', facts)).toBeNull();
    expect(validateInsightLine('Great job היום!', 'male', facts)).toBeNull();
    expect(validateInsightLine('כל הכבוד 💪', 'male', facts)).toBeNull();
    expect(validateInsightLine('את/ה בטופ!', 'male', facts)).toBeNull();
    expect(validateInsightLine('אתה מתקדם יפה!', 'female', facts)).toBeNull();
    expect(validateInsightLine('אתה מתקדם יפה!', 'other', facts)).toBeNull();
  });
  it('parses the JSON reply, tolerating a fence; garbage → empty', () => {
    const r = parseInsightReply('```json\n{"insight":"עבודה יפה היום!","funny":null}\n```', 'male', facts);
    expect(r).toEqual({ insight: 'עבודה יפה היום!', funny: null });
    expect(parseInsightReply('not json', 'male', facts)).toEqual({ insight: null, funny: null });
  });
});

describe('gate', () => {
  it('stored flag, or the super-admin preview', () => {
    expect(workoutInsightsOnFor({ enableWorkoutInsightsV1: false }, false)).toBe(false);
    expect(workoutInsightsOnFor({ enableWorkoutInsightsV1: true }, false)).toBe(true);
    expect(workoutInsightsOnFor({ enableWorkoutInsightsV1: false }, true)).toBe(true);
    expect(workoutInsightsOnFor(null, false)).toBe(false);
  });
});
