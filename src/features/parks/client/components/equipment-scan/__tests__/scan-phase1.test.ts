/**
 * Camera scan phase 1, pure parts: the screen after a verdict, the dark check, API error mapping,
 * the drawer's personal levels / beginner domain, and the photo-first pill icon.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, appCheck: null }));

import { screenFromVerdict } from '../scan-flow';
import { isTooDark, meanLuma } from '../scan-brightness';
import { errorFromStatus, postScan } from '../scan-api';
import { mainProgramOf, personalLevelItems, quizDomainFor } from '../../equipment-detail/v2/equipment-levels';
import { equipmentPillSources } from '../../contribution-wizard/EquipmentPillIcon';

describe('screenFromVerdict', () => {
  it('confirm / choose / edges', () => {
    expect(screenFromVerdict({ kind: 'confirm', candidateId: 'a', alternatives: ['b', 'urban:bench'] })).toEqual({ kind: 'confirm', equipmentId: 'a', alternatives: ['b'], open: false });
    expect(screenFromVerdict({ kind: 'choose', candidateId: 'a', alternatives: [] })).toMatchObject({ open: true });
    expect(screenFromVerdict({ kind: 'retake', reason: 'people' })).toEqual({ kind: 'edge', edge: 'people' });
    expect(screenFromVerdict({ kind: 'retake', reason: 'dark' })).toEqual({ kind: 'edge', edge: 'dark' });
    expect(screenFromVerdict({ kind: 'retake', reason: 'blurry' })).toEqual({ kind: 'edge', edge: 'not_found' });
    expect(screenFromVerdict(undefined)).toEqual({ kind: 'edge', edge: 'not_found' });
  });
  it('a bench has no drawer: falls to the next catalog item, or not found', () => {
    expect(screenFromVerdict({ kind: 'confirm', candidateId: 'urban:bench', alternatives: ['x', 'y'] })).toEqual({ kind: 'confirm', equipmentId: 'x', alternatives: ['y'], open: true });
    expect(screenFromVerdict({ kind: 'confirm', candidateId: 'urban:stairs', alternatives: [] })).toEqual({ kind: 'edge', edge: 'not_found' });
  });
});

describe('brightness', () => {
  it('mean luma over RGBA, dark below 40', () => {
    expect(meanLuma([0, 0, 0, 255, 255, 255, 255, 255])).toBeCloseTo(127.5);
    expect(isTooDark(meanLuma([10, 10, 10, 255]))).toBe(true);
    expect(isTooDark(120)).toBe(false);
  });
});

describe('scan api', () => {
  it('maps statuses', () => {
    expect(errorFromStatus(429, 'rate_limited')).toBe('rate_limited');
    expect(errorFromStatus(404, 'not_enabled')).toBe('not_enabled');
    expect(errorFromStatus(401, 'invalid_token')).toBe('not_signed_in');
    expect(errorFromStatus(503, 'kill_switch')).toBe('unavailable');
  });
  it('signed out → no request', async () => {
    const f = vi.fn();
    expect(await postScan({ image: 'x', mode: 'single' }, f as never)).toEqual({ ok: false, error: 'not_signed_in' });
    expect(f).not.toHaveBeenCalled();
  });
});

const item = (id: string, level: number, programId = 'push') => ({ id, name: id, level, thumb: '', programId });

describe('personal levels', () => {
  const items = [item('a', 3), item('b', 6), item('c', 9), item('d', 12), item('u', 0, 'core')];
  it('open up to the level, the highest open one is yours, above locked, unknown never locked', () => {
    expect(personalLevelItems(items, 6)!.map((i) => [i.id, i.state])).toEqual([
      ['a', 'completed'], ['b', 'current'], ['c', 'locked'], ['d', 'locked'], ['u', 'completed'],
    ]);
    expect(personalLevelItems(items, 1)!.find((i) => i.state === 'current')).toBeUndefined();
  });
  it('no level → null (beginner state)', () => {
    expect(personalLevelItems(items, null)).toBeNull();
  });
  it('main program = most exercises', () => {
    expect(mainProgramOf(items)).toBe('push');
    expect(mainProgramOf([item('x', 1, '')])).toBeNull();
  });
  it('quiz domain from the program, else the movement pattern', () => {
    expect(quizDomainFor('pull', null)).toBe('pull');
    expect(quizDomainFor('full_body', 'squat')).toBe('legs');
    expect(quizDomainFor(null, 'vertical_pull')).toBe('pull');
    expect(quizDomainFor(null, undefined)).toBe('push');
  });
});

describe('pill sources', () => {
  const eq = { iconKey: 'rings', brands: [{ brandName: 'A', imageUrl: 'https://x/a.jpg' }] } as never;
  it('scan screens put the real photo first', () => {
    expect(equipmentPillSources(eq).map((s) => s.kind)).toEqual(['icon', 'photo']);
    expect(equipmentPillSources(eq, true).map((s) => s.kind)).toEqual(['photo', 'icon']);
  });
});
