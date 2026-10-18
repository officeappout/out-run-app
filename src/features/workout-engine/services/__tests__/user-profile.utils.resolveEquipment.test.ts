import { describe, it, expect } from 'vitest';
import { resolveEquipment } from '../user-profile.utils';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

function makeProfile(equipment: { home?: string[]; office?: string[]; outdoor?: string[] } = {}): UserFullProfile {
  return {
    equipment: {
      home: equipment.home ?? [],
      office: equipment.office ?? [],
      outdoor: equipment.outdoor ?? [],
    },
  } as unknown as UserFullProfile;
}

describe('resolveEquipment', () => {
  it('returns the real equipment array unchanged when non-empty', () => {
    const profile = makeProfile({ outdoor: ['pullup_bar'] });
    expect(resolveEquipment(profile, 'park')).toEqual(['pullup_bar']);
  });

  it('empty profile, no active skill program → defaults to bodyweight only (unchanged pre-existing behavior)', () => {
    const profile = makeProfile();
    expect(resolveEquipment(profile, 'park')).toEqual(['bodyweight']);
    expect(resolveEquipment(profile, 'park', undefined, false)).toEqual(['bodyweight']);
  });

  it('Decision F reverted (H1 gear truth, 2026-10-18): empty profile + active skill program → bodyweight only, no assumed band', () => {
    const profile = makeProfile();
    expect(resolveEquipment(profile, 'park', undefined, true)).toEqual(['bodyweight']);
    expect(resolveEquipment(profile, 'home', undefined, true)).toEqual(['bodyweight']);
  });

  it('a skill user who OWNS a band keeps it (it comes from the profile, not an assumption)', () => {
    const profile = makeProfile({ home: ['I1K30JehaxSx8dlBOZyd'] });
    expect(resolveEquipment(profile, 'home', undefined, true)).toEqual(['I1K30JehaxSx8dlBOZyd']);
  });

  it('a non-empty profile is never touched by the skill flag — real equipment always wins', () => {
    const profile = makeProfile({ outdoor: ['dip_station'] });
    expect(resolveEquipment(profile, 'park', undefined, true)).toEqual(['dip_station']);
  });

  it('an explicit equipmentOverride always wins, regardless of the skill flag', () => {
    const profile = makeProfile();
    expect(resolveEquipment(profile, 'park', ['rings'], true)).toEqual(['rings']);
  });
});
