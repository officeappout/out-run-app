import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clampLevelsToContentCeiling } from '../InputSanitizerMiddleware';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Generator audit P0 #3 (2026-10-17): top-of-program users got "יום מנוחה".
 * Authored content ends below each program's maxLevel (push ~L20 of 25,
 * core L14 of 20, …); with the ±3 window a L25 push user had zero candidates,
 * and when every requested domain was empty the PipelineOrchestrator's
 * empty-pool guard served the rest-day fallback on a training day.
 * clampLevelsToContentCeiling clamps the request-scoped selection level to
 * the highest PERFORMABLE authored level, derived from the pool at runtime.
 */

const ex = (id: string, programId: string, level: number, methods?: Array<Record<string, unknown>>, role?: string): Exercise =>
  ({
    id,
    name: { he: id, en: id },
    targetPrograms: [{ programId, level }],
    execution_methods: methods ?? [{ location: 'home', gearIds: [] }],
    ...(role ? { exerciseRole: role } : {}),
  } as unknown as Exercise);

const slug = (id: string) => id;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('clampLevelsToContentCeiling', () => {
  const pushPool = [ex('p18', 'push', 18), ex('p19', 'push', 19), ex('p20', 'push', 20)];

  it('L25 user, push content tops at L20 → selection level clamped to 20 (logged)', () => {
    const levels = new Map([['push', 25]]);
    const clamps = clampLevelsToContentCeiling(levels, pushPool, 'home', ['bodyweight'], slug);
    expect(levels.get('push')).toBe(20);
    expect(clamps).toEqual([{ domain: 'push', from: 25, to: 20 }]);
  });

  it('no clamp while content still exists inside the ±3 window (L22 sees L20 content)', () => {
    const levels = new Map([['push', 22]]);
    expect(clampLevelsToContentCeiling(levels, pushPool, 'home', ['bodyweight'], slug)).toEqual([]);
    expect(levels.get('push')).toBe(22);
  });

  it('the ceiling is the highest PERFORMABLE level here: unperformable top content is skipped', () => {
    // pull L22 needs rings (not owned at home) → office/home ceiling is L19.
    const pool = [
      ex('pull22', 'pull', 22, [{ location: 'home', gearIds: ['rings'] }]),
      ex('pull19', 'pull', 19),
    ];
    const levels = new Map([['pull', 25]]);
    clampLevelsToContentCeiling(levels, pool, 'home', ['bodyweight'], slug);
    expect(levels.get('pull')).toBe(19);
  });

  it('warmup/cooldown-role content does not count as a ceiling', () => {
    const pool = [ex('core14', 'core', 14), ex('core20-warmup', 'core', 20, undefined, 'warmup')];
    const levels = new Map([['core', 20]]);
    clampLevelsToContentCeiling(levels, pool, 'home', ['bodyweight'], slug);
    expect(levels.get('core')).toBe(14);
  });

  it('resolves hashed programIds through the slug resolver', () => {
    const pool = [ex('legs13', 'HASH_LEGS', 13)];
    const levels = new Map([['legs', 18]]);
    clampLevelsToContentCeiling(levels, pool, 'home', ['bodyweight'], (id) => (id === 'HASH_LEGS' ? 'legs' : id));
    expect(levels.get('legs')).toBe(13);
  });

  it('a domain with no authored content at all is left untouched', () => {
    const levels = new Map([['planche', 12]]);
    expect(clampLevelsToContentCeiling(levels, pushPool, 'home', ['bodyweight'], slug)).toEqual([]);
    expect(levels.get('planche')).toBe(12);
  });

  it('only clamps domains that are actually empty; others keep the real level', () => {
    const levels = new Map([['push', 25], ['legs', 5]]);
    const pool = [...pushPool, ex('legs5', 'legs', 5)];
    clampLevelsToContentCeiling(levels, pool, 'home', ['bodyweight'], slug);
    expect(levels.get('push')).toBe(20);
    expect(levels.get('legs')).toBe(5);
  });
});

describe('clampLevelsToContentCeiling — master/wrapper programs are never clamped', () => {
  it('full_body / upper_body keep their level even when only low legacy tags exist', () => {
    const pool = [
      { id: 'legacy', name: { he: 'x', en: 'x' }, targetPrograms: [{ programId: 'full_body', level: 2 }, { programId: 'upper_body', level: 2 }], execution_methods: [{ location: 'home', gearIds: [] }] },
    ] as unknown as Exercise[];
    const levels = new Map([['full_body', 12], ['upper_body', 19]]);
    expect(clampLevelsToContentCeiling(levels, pool, 'home', ['bodyweight'], (id) => id)).toEqual([]);
    expect(levels.get('full_body')).toBe(12);
    expect(levels.get('upper_body')).toBe(19);
  });
});
