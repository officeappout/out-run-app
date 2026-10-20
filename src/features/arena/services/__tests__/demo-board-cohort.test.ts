import { describe, it, expect } from 'vitest';
import { isDemoBoardScope, resolveBoardCohort } from '../demo-board-cohort';

const base = { mode: 'credit' as const, known: null, hint: 'adult' as const };

describe('resolveBoardCohort — real scopes unchanged', () => {
  it('same cohort as before for every real scope, whatever the demo-world flag', () => {
    for (const inWorld of [false, true]) {
      expect(resolveBoardCohort({ ...base, scope: 'city', scopeId: 'sderot' }, inWorld)).toEqual({ ageGroup: 'adult', keepDemoRows: false, denied: false });
      expect(resolveBoardCohort({ ...base, scope: 'global', scopeId: '' }, inWorld).ageGroup).toBe('adult');
      expect(resolveBoardCohort({ ...base, scope: 'city', scopeId: 'x', known: 'minor' }, inWorld).ageGroup).toBe('minor');
      expect(resolveBoardCohort({ ...base, scope: 'city', scopeId: 'x', mode: 'steps' }, inWorld).ageGroup).toBe('minor');
      expect(resolveBoardCohort({ ...base, scope: 'city', scopeId: 'x', hint: 'minor' }, inWorld).ageGroup).toBe('minor');
    }
  });
});

describe('resolveBoardCohort — demo scopes', () => {
  it('a demo city ranks the demo cohort for the demo world', () => {
    expect(resolveBoardCohort({ ...base, scope: 'city', scopeId: 'demo-city' }, true)).toEqual({ ageGroup: 'demo', keepDemoRows: true, denied: false });
    expect(resolveBoardCohort({ ...base, scope: 'neighborhood', scopeId: 'demo-city-n2', mode: 'steps' }, true).ageGroup).toBe('demo');
  });

  it('a real caller asking for a demo scope is denied (empty board)', () => {
    expect(resolveBoardCohort({ ...base, scope: 'city', scopeId: 'demo-city' }, false).denied).toBe(true);
  });

  it('a demo group (league) board is members-only already — keeps demo rows, no gate', () => {
    expect(resolveBoardCohort({ ...base, scope: 'league', scopeId: 'demo-grp-walk' }, false)).toEqual({ ageGroup: 'adult', keepDemoRows: true, denied: false });
  });

  it('isDemoBoardScope', () => {
    expect(isDemoBoardScope('global', 'demo-city')).toBe(false);
    expect(isDemoBoardScope('city', 'demo-city')).toBe(true);
    expect(isDemoBoardScope('city', 'sderot')).toBe(false);
  });
});
