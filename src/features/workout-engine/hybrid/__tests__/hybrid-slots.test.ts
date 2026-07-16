import { describe, it, expect, vi, beforeEach } from 'vitest';

// Togglable flag mock — a live getter so each resolveSlots() call reads the CURRENT
// value, letting us cover both flag states in one file.
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('@/config/feature-flags', () => ({
  get HYBRID_FULL_PARK_WORKOUT_ENABLED() {
    return flag.enabled;
  },
}));

import { resolveSlots, type SlotEnv } from '../hybrid-slots';

const env = (over: Partial<SlotEnv> = {}): SlotEnv => ({
  hasGps: true,
  nearbyParkCount: 1,
  aerobicKind: 'walking',
  ...over,
});
const ids = (slots: ReturnType<typeof resolveSlots>) => slots.map((s) => s.id);

describe('resolveSlots — full-park gate', () => {
  beforeEach(() => {
    flag.enabled = true;
  });

  it('adds the full_park card when flag ON + equipped park + strength program', () => {
    const slots = resolveSlots(env({ hasEquippedPark: true, hasStrengthProgram: true }));
    expect(ids(slots)).toContain('full_park');
    const fp = slots.find((s) => s.id === 'full_park')!;
    expect(fp.kind).toBe('hybrid');
    expect(fp.title).toBe('אימון מלא בפארק');
    if (fp.kind === 'hybrid') {
      // preset carries the compose-branch marker + follows the active activity.
      expect(fp.preset.mode).toBe('full_park_workout');
      expect(fp.preset.aerobicKind).toBe('walking');
    }
  });

  it('follows the active activity (running)', () => {
    const slots = resolveSlots(env({ aerobicKind: 'running', hasEquippedPark: true, hasStrengthProgram: true }));
    const fp = slots.find((s) => s.id === 'full_park');
    expect(fp?.kind === 'hybrid' && fp.preset.aerobicKind).toBe('running');
  });

  it('is absent without an equipped park', () => {
    expect(ids(resolveSlots(env({ hasEquippedPark: false, hasStrengthProgram: true })))).not.toContain('full_park');
  });

  it('is absent without a strength program', () => {
    expect(ids(resolveSlots(env({ hasEquippedPark: true, hasStrengthProgram: false })))).not.toContain('full_park');
  });

  it('is absent when the gate signals are not provided (existing callers unchanged)', () => {
    expect(ids(resolveSlots(env()))).not.toContain('full_park');
  });

  it('is absent when the flag is OFF, even with the gate open', () => {
    flag.enabled = false;
    expect(ids(resolveSlots(env({ hasEquippedPark: true, hasStrengthProgram: true })))).not.toContain('full_park');
  });

  it('never disturbs the existing recommended + aerobic_quick slots', () => {
    const slots = resolveSlots(env({ hasEquippedPark: true, hasStrengthProgram: true }));
    expect(ids(slots)).toEqual(expect.arrayContaining(['recommended', 'aerobic_quick']));
  });
});
