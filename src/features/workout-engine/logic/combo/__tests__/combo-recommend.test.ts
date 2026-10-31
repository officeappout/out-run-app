import { describe, expect, it } from 'vitest';
import { recommendCombos, resolveCategory, type ComboIntent } from '../combo-recommend';

const intent = (over: Partial<ComboIntent> = {}): ComboIntent => ({ category: 'hybrid', minutes: 30, stars: 2, place: 'park', outdoor: true, ...over });
const strong = { push: 9, pull: 8 };
const beginner = { push: 3, pull: 2 };
const reasons = (o: ReturnType<typeof recommendCombos>) => o.map((x) => x.reason);

describe('recommendCombos: the engine picks the format and the order', () => {
  it('hybrid outdoors, level 8+ in both, 2+ stars → AMRAP with a run inside leads', () => {
    const o = recommendCombos(intent(), { levels: strong });
    expect(o[0]).toMatchObject({ reason: 'amrap_run', request: { order: 'inside', strength: 'amrap', amrapVariant: 'run' } });
    expect(o.length).toBeLessThanOrEqual(3);
  });
  it('never an AMRAP with a run below level 8, indoors, or at 1 star', () => {
    expect(reasons(recommendCombos(intent(), { levels: beginner }))).not.toContain('amrap_run');
    expect(reasons(recommendCombos(intent({ outdoor: false }), { levels: strong }))).not.toContain('amrap_run');
    expect(reasons(recommendCombos(intent({ stars: 1 }), { levels: strong }))).not.toContain('amrap_run');
  });
  it('hybrid short: aerobic then tabata (core at 1 star, a walk)', () => {
    expect(recommendCombos(intent({ minutes: 20 }), { levels: beginner })[0]).toMatchObject({ reason: 'aerobic_then_tabata', request: { aerobic: 'run' } });
    expect(recommendCombos(intent({ minutes: 15, stars: 1 }), { levels: beginner })[0]).toMatchObject({ reason: 'aerobic_then_core', request: { aerobic: 'walk', strength: 'core' } });
  });
  it('hybrid longer: aerobic then sets (AMRAP at 3 stars), tabata as a second option', () => {
    expect(reasons(recommendCombos(intent({ minutes: 40 }), { levels: beginner }))).toEqual(['aerobic_then_sets', 'aerobic_then_tabata']);
    expect(recommendCombos(intent({ minutes: 40, stars: 3, place: 'home' }), { levels: beginner })[0].request.amrapVariant).toBe('strength');
  });
  it('strength: short → tabata / EMOM; longer → sets + an AMRAP (strength-only at home, cardio elsewhere)', () => {
    expect(reasons(recommendCombos(intent({ category: 'strength', minutes: 12, stars: 3 }), { levels: beginner }))).toEqual(['short_emom', 'short_tabata']);
    expect(reasons(recommendCombos(intent({ category: 'strength', minutes: 30, place: 'home' }), { levels: beginner }))).toEqual(['sets', 'amrap_strength']);
    expect(reasons(recommendCombos(intent({ category: 'strength', minutes: 30, stars: 1 }), { levels: beginner }))).toEqual(['sets']);
  });
  it('aerobic: walk at 1 star, run otherwise, a core finisher option at 3 stars', () => {
    expect(reasons(recommendCombos(intent({ category: 'aerobic', stars: 1 }), { levels: beginner }))).toEqual(['walk']);
    expect(reasons(recommendCombos(intent({ category: 'aerobic', stars: 3 }), { levels: beginner }))).toEqual(['run', 'run_then_core']);
  });
  it('recommended follows today: strength day → strength, rest → aerobic, else hybrid', () => {
    expect(resolveCategory(intent({ category: 'recommended' }), { levels: {}, today: 'strength' })).toBe('strength');
    expect(resolveCategory(intent({ category: 'recommended' }), { levels: {}, today: 'rest' })).toBe('aerobic');
    expect(resolveCategory(intent({ category: 'recommended' }), { levels: {} })).toBe('hybrid');
  });
  it('every option is normalized (time clamped)', () => {
    expect(recommendCombos(intent({ minutes: 200 }), { levels: beginner })[0].request.timeMin).toBe(90);
  });
});
