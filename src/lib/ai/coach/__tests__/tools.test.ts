import { describe, it, expect } from 'vitest';
import {
  COACH_DOMAINS,
  COACH_TOOLS,
  ClientToolOutcomeSchema,
  coachToolDefinitions,
  sanitizeWorkoutEquipment,
  toolKind,
  validateToolInput,
  GenerateWorkoutInput,
} from '../tools';

describe('tool registry', () => {
  it('has the expected tools, generate_workout is the only client tool', () => {
    expect(Object.keys(COACH_TOOLS)).toEqual([
      'get_user_context',
      'get_progress',
      'get_schedule',
      'generate_workout',
      'explain_workout',
      'get_workout_details',
      'handoff_to_human',
    ]);
    expect(toolKind('generate_workout')).toBe('client');
    expect(toolKind('get_progress')).toBe('server');
    expect(toolKind('generate_route')).toBeNull();
  });

  it('definitions are deterministic (cache-stable) and carry no cache_control themselves', () => {
    const a = JSON.stringify(coachToolDefinitions());
    const b = JSON.stringify(coachToolDefinitions());
    expect(a).toBe(b);
    expect(a).not.toContain('cache_control');
  });

  it('domain whitelist = push/pull/legs/core + the skill domains, and the JSON schema enum matches zod', () => {
    expect(COACH_DOMAINS.slice(0, 4)).toEqual(['pull', 'push', 'legs', 'core']);
    expect(COACH_DOMAINS).toContain('planche');
    const schema = COACH_TOOLS.generate_workout.inputSchema as any;
    expect(schema.properties.domains.items.enum).toEqual([...COACH_DOMAINS]);
    expect(schema.properties.location.enum).toEqual(['home', 'park', 'office', 'street']);
  });
});

describe('validateToolInput', () => {
  it('accepts a valid generate_workout input and fills defaults', () => {
    const v = validateToolInput('generate_workout', { durationMin: 25, location: 'home', difficulty: 2, domains: ['core', 'legs'] });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.input).toMatchObject({ equipment: [], domains: ['core', 'legs'] });
  });

  it.each([
    [{ durationMin: 4, location: 'home', difficulty: 2 }, 'durationMin'],
    [{ durationMin: 91, location: 'home', difficulty: 2 }, 'durationMin'],
    [{ durationMin: 20, location: 'gym', difficulty: 2 }, 'location'],
    [{ durationMin: 20, location: 'home', difficulty: 4 }, 'difficulty'],
    [{ durationMin: 20, location: 'home', difficulty: 2, domains: ['abs'] }, 'domains'],
    [{ durationMin: 20.5, location: 'home', difficulty: 2 }, 'durationMin'],
  ])('rejects %j', (input, field) => {
    const v = validateToolInput('generate_workout', input);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain(field);
  });

  it('rejects unknown tools', () => {
    expect(validateToolInput('rm_rf', {}).ok).toBe(false);
  });

  it('get_schedule: at most 14 days, to >= from, real dates', () => {
    expect(validateToolInput('get_schedule', { from: '2026-10-18', to: '2026-10-31' }).ok).toBe(true);
    expect(validateToolInput('get_schedule', { from: '2026-10-18', to: '2026-11-01' }).ok).toBe(false);
    expect(validateToolInput('get_schedule', { from: '2026-10-18', to: '2026-10-17' }).ok).toBe(false);
    expect(validateToolInput('get_schedule', { from: '18/10/2026', to: '2026-10-20' }).ok).toBe(false);
  });

  it('handoff summary is trimmed and bounded', () => {
    expect(validateToolInput('handoff_to_human', { summary: '   ' }).ok).toBe(false);
    expect(validateToolInput('handoff_to_human', { summary: 'x'.repeat(501) }).ok).toBe(false);
    expect(validateToolInput('handoff_to_human', { summary: 'רוצה לדבר עם מאמנת על כאב בברך' }).ok).toBe(true);
  });

  it('get_progress range enum', () => {
    expect(validateToolInput('get_progress', { range: 'year' }).ok).toBe(false);
    expect(validateToolInput('get_progress', { range: 'month' }).ok).toBe(true);
  });
});

describe('sanitizeWorkoutEquipment', () => {
  const base = GenerateWorkoutInput.parse({ durationMin: 20, location: 'park', difficulty: 2, equipment: ['bar', 'rings', 'bar'] });
  it('keeps only gear the user owns for that location bucket (park → outdoor), de-duplicated', () => {
    const out = sanitizeWorkoutEquipment(base, { home: ['rings'], outdoor: ['bar'] });
    expect(out.equipment).toEqual(['bar']);
  });
  it('no profile equipment → empty list', () => {
    expect(sanitizeWorkoutEquipment(base, undefined).equipment).toEqual([]);
  });
});

describe('ClientToolOutcomeSchema', () => {
  const result = {
    workoutId: 'ai-mgw1x2-abc123',
    title: 'אימון בטן ורגליים',
    minutes: 25,
    location: 'home',
    exercises: [{ name: 'סקוואט', sets: 3, reps: 12, seconds: null }],
  };
  it('accepts a compact result', () => {
    expect(ClientToolOutcomeSchema.safeParse({ ok: true, result }).success).toBe(true);
  });
  it('rejects a forged workout id and oversized lists', () => {
    expect(ClientToolOutcomeSchema.safeParse({ ok: true, result: { ...result, workoutId: '../../x' } }).success).toBe(false);
    const many = Array.from({ length: 21 }, () => result.exercises[0]);
    expect(ClientToolOutcomeSchema.safeParse({ ok: true, result: { ...result, exercises: many } }).success).toBe(false);
  });
  it('accepts a typed failure', () => {
    expect(ClientToolOutcomeSchema.safeParse({ ok: false, error: 'needs_assessment', domains: ['planche'] }).success).toBe(true);
    expect(ClientToolOutcomeSchema.safeParse({ ok: false, error: 'boom' }).success).toBe(false);
  });
});
