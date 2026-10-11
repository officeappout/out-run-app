/**
 * session-focus.utils.test.ts
 *
 * Covers the muscle-fatigue-writer blindness fix (11.10.2026, domain-balance
 * audit): a calisthenics_upper session's programId is always the generic
 * master id, never the day's dominant skill, so the old programId-substring
 * check alone never classified it — SplitDecisionService's Pendulum split
 * then never saw a real lastSessionFocus and stayed stuck in hybrid_blend.
 */
import { describe, it, expect } from 'vitest';
import { deriveSessionFocus } from '../session-focus.utils';
import type { Exercise, MuscleGroup } from '@/features/content/exercises/core/exercise.types';

function ex(movementGroup: Exercise['movementGroup']): Pick<Exercise, 'movementGroup'> {
  return { movementGroup };
}

describe('deriveSessionFocus', () => {
  it('a plain push program id matches by substring, regardless of exercises', () => {
    expect(deriveSessionFocus('push', [], [])).toBe('push');
  });

  it('a plain pull program id matches by substring', () => {
    expect(deriveSessionFocus('pulling', [], [])).toBe('pull');
  });

  it('a legs/lower_body program id matches by substring', () => {
    expect(deriveSessionFocus('lower_body', [], [])).toBe('legs');
  });

  it('leg-muscle majority classifies as legs even without a matching program id', () => {
    const legs: MuscleGroup[] = ['quads', 'hamstrings', 'glutes'];
    expect(deriveSessionFocus('full_body', [], legs)).toBe('legs');
  });

  // The actual bug: calisthenics_upper's programId never matches push/pull/legs.
  it('calisthenics_upper (planche-dominant session) falls back to push via movement-group majority', () => {
    const exercises = [ex('horizontal_push'), ex('horizontal_push'), ex('vertical_push')];
    expect(deriveSessionFocus('calisthenics_upper', exercises, ['chest', 'shoulders'])).toBe('push');
  });

  it('calisthenics_upper (front_lever-dominant session) falls back to pull via movement-group majority', () => {
    const exercises = [ex('horizontal_pull'), ex('vertical_pull'), ex('vertical_pull')];
    expect(deriveSessionFocus('calisthenics_upper', exercises, ['back', 'biceps'])).toBe('pull');
  });

  it('a tie between push and pull movement groups resolves to push (documented default)', () => {
    const exercises = [ex('horizontal_push'), ex('horizontal_pull')];
    expect(deriveSessionFocus('calisthenics_upper', exercises, [])).toBe('push');
  });

  it('no classifiable signal at all returns undefined (not a fabricated default)', () => {
    const exercises = [ex('core'), ex('isolation')];
    expect(deriveSessionFocus('calisthenics_upper', exercises, ['abs'])).toBeUndefined();
  });

  it('explicit programId substring match wins over movement-group majority', () => {
    // A 'push' program id with mostly pull-tagged accessory exercises should
    // still report 'push' — the program id is the stronger, intentional signal.
    const exercises = [ex('horizontal_pull'), ex('vertical_pull')];
    expect(deriveSessionFocus('push', exercises, [])).toBe('push');
  });
});
