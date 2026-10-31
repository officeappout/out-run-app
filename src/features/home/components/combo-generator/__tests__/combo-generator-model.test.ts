import { describe, expect, it } from 'vitest';
import { recommendCombos } from '@/features/workout-engine/logic/combo/combo-recommend';
import {
  aerobicHrefOf, comboCanRunOf, comboCardModel, comboIntentOf, comboLaunchOf, comboLevelsOf, comboTodayOf, hybridFormDefaults, hybridIntentOfForm,
} from '../combo-generator-model';

describe('comboTodayOf', () => {
  it('maps the day plan to the engine input', () => {
    expect(comboTodayOf(undefined)).toBeUndefined();
    expect(comboTodayOf([])).toBe('rest');
    expect(comboTodayOf(['strength'])).toBe('strength');
    expect(comboTodayOf(['walk', 'strength'])).toBe('none');
    expect(comboTodayOf(['run'])).toBe('run');
    expect(comboTodayOf(['walk', 'group'])).toBe('walk');
  });
});

describe('comboLevelsOf', () => {
  it('reads push / pull through the slug map, keeps the higher level', () => {
    const levels = new Map([['hashPush', 9], ['pull', 8], ['push', 4], ['legs', 12]]);
    expect(comboLevelsOf(levels, (id) => (id === 'hashPush' ? 'push' : id))).toEqual({ push: 9, pull: 8 });
  });
  it('an empty slug falls back to the key', () => {
    expect(comboLevelsOf(new Map([['pull', 3]]), () => '')).toEqual({ pull: 3 });
  });
});

describe('comboIntentOf', () => {
  it('park is outdoor, home is not; stars clamp to 1-3', () => {
    expect(comboIntentOf({ category: 'hybrid', minutes: 30, stars: 3, location: 'park' }))
      .toEqual({ category: 'hybrid', minutes: 30, stars: 3, place: 'park', outdoor: true });
    expect(comboIntentOf({ category: 'strength', minutes: 15, stars: 7, location: 'home' }))
      .toMatchObject({ place: 'home', outdoor: false, stars: 2 });
  });
});

describe('comboCardModel', () => {
  it('aerobic first, with the time split', () => {
    const [main] = recommendCombos(comboIntentOf({ category: 'hybrid', minutes: 40, stars: 2, location: 'park' }), { levels: {} });
    const card = comboCardModel(main);
    expect(card.parts.map((p) => p.kind)).toEqual(['run', 'sets']);
    expect(card.parts[0].minutes + card.parts[1].minutes).toBe(40);
    expect(card.place).toBe('park');
  });
  it('a run inside the AMRAP is one part', () => {
    const [main] = recommendCombos(comboIntentOf({ category: 'hybrid', minutes: 30, stars: 3, location: 'park' }), { levels: { push: 8, pull: 9 } });
    expect(main.reason).toBe('amrap_run');
    expect(comboCardModel(main).parts).toEqual([{ kind: 'amrap', minutes: 30, withRun: true }]);
  });
  it('strength only has no aerobic part', () => {
    const [main] = recommendCombos(comboIntentOf({ category: 'strength', minutes: 30, stars: 1, location: 'home' }), { levels: {} });
    expect(comboCardModel(main).parts).toEqual([{ kind: 'sets', minutes: 30 }]);
  });
});

describe('comboLaunchOf', () => {
  const base = { place: 'park' as const, timeMin: 30 };
  it('strength only → the builder generate; short formats run as blast', () => {
    expect(comboLaunchOf({ ...base, aerobic: 'none', strength: 'sets', order: 'strength_first' }, 2)).toEqual({ kind: 'strength', minutes: 30 });
    expect(comboLaunchOf({ ...base, timeMin: 12, aerobic: 'none', strength: 'tabata', order: 'strength_first' }, 1))
      .toEqual({ kind: 'strength', minutes: 12, intentMode: 'blast' });
  });
  it('aerobic only → the free run drawer', () => {
    expect(comboLaunchOf({ ...base, aerobic: 'walk', strength: 'none', order: 'aerobic_first' }, 1)).toEqual({ kind: 'aerobic', href: '/map?openRun=walking' });
  });
  it('aerobic + strength → a hybrid intent inside the slider bounds', () => {
    const l = comboLaunchOf({ ...base, aerobic: 'run', strength: 'tabata', order: 'aerobic_first' }, 3);
    expect(l).toEqual({ kind: 'hybrid', intent: { timeBudgetMin: 30, aerobicShare: 0.7, emphasis: 'aerobic', aerobicKind: 'running', difficulty: 3 } });
    const s = comboLaunchOf({ ...base, aerobic: 'walk', strength: 'sets', order: 'aerobic_first' }, 2);
    expect(s.kind === 'hybrid' && s.intent.aerobicShare).toBeCloseTo(0.53, 2);
    expect(s.kind === 'hybrid' && s.intent.emphasis).toBe('balanced');
  });
});

describe('hybrid form', () => {
  it('presets from the engine, snapped to the pills', () => {
    const [top] = recommendCombos(comboIntentOf({ category: 'hybrid', minutes: 40, stars: 2, location: 'park' }), { levels: {} });
    expect(hybridFormDefaults(top, 2)).toEqual({ aerobicKind: 'running', aerobicMin: 20, strengthMin: 20, stars: 2 });
  });
  it('a walk preset at 1 star; no engine option → a balanced walk', () => {
    const [top] = recommendCombos(comboIntentOf({ category: 'hybrid', minutes: 15, stars: 1, location: 'park' }), { levels: {} });
    expect(hybridFormDefaults(top, 1).aerobicKind).toBe('walking');
    expect(hybridFormDefaults(undefined, 2)).toEqual({ aerobicKind: 'walking', aerobicMin: 25, strengthMin: 15, stars: 2 });
  });
  it('the form → a hybrid intent', () => {
    expect(hybridIntentOfForm({ aerobicKind: 'cycling', aerobicMin: 25, strengthMin: 15, stars: 3 }))
      .toEqual({ timeBudgetMin: 40, aerobicShare: 0.63, emphasis: 'aerobic', aerobicKind: 'cycling', difficulty: 3 });
    expect(hybridIntentOfForm({ aerobicKind: 'walking', aerobicMin: 15, strengthMin: 30, stars: 1 }).aerobicShare).toBe(0.33);
  });
  it('the aerobic tab opens the free run drawer', () => {
    expect(aerobicHrefOf('cycling')).toBe('/map?openRun=cycling');
  });
});

describe('comboCanRunOf (AH25)', () => {
  it('a run plan or a pace profile = filled the running questionnaire', () => {
    expect(comboCanRunOf({ running: { activeProgram: { schedule: [{}] } } })).toBe(true);
    expect(comboCanRunOf({ running: { paceProfile: { basePace: 360 } } })).toBe(true);
    expect(comboCanRunOf({ running: { activeProgram: { schedule: [] } } })).toBe(false);
    expect(comboCanRunOf({})).toBe(false);
    expect(comboCanRunOf(null)).toBe(false);
  });
});
