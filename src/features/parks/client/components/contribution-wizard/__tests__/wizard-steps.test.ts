import { describe, it, expect } from 'vitest';
import { indicatorStepIds, wizardStepIds } from '../wizard-steps';
import { equipmentPillSources } from '../EquipmentPillIcon';

const park = { facilityType: null, isPointOfInterest: false };

describe('add-location wizard steps (owner report 23.10.2026)', () => {
  it('navigation is unchanged: equipment only for gym_park', () => {
    expect(wizardStepIds(park)).toEqual(['location', 'details', 'photo']);
    expect(wizardStepIds({ ...park, facilityType: 'gym_park' })).toEqual(['location', 'details', 'equipment', 'photo']);
    expect(wizardStepIds({ ...park, facilityType: 'court' })).toEqual(['location', 'details', 'photo']);
  });

  it('a park shows 4 steps from step 1 — same count as on the equipment step', () => {
    expect(indicatorStepIds(park, 0)).toEqual(['location', 'details', 'equipment', 'photo']);
    expect(indicatorStepIds(park, 1)).toEqual(['location', 'details', 'equipment', 'photo']);
    expect(indicatorStepIds({ ...park, facilityType: 'gym_park' }, 2)).toEqual(['location', 'details', 'equipment', 'photo']);
  });

  it('a point of interest or a non-gym type shows the real 3 steps', () => {
    expect(indicatorStepIds({ facilityType: 'urban_spot', isPointOfInterest: true }, 0)).toEqual(['location', 'details', 'photo']);
    expect(indicatorStepIds({ ...park, facilityType: 'court' }, 1)).toEqual(['location', 'details', 'photo']);
  });

  it('after the details step the indicator always matches navigation', () => {
    expect(indicatorStepIds(park, 2)).toEqual(wizardStepIds(park));
  });
});

describe('equipment pill icon sources (v2 regression: dumbbell instead of photos)', () => {
  it('authored SVG first, then the first brand photo', () => {
    expect(
      equipmentPillSources({ iconKey: 'rings', brands: [{ brandName: 'A', imageUrl: 'https://x.b-cdn.net/a.jpg' }] as never }),
    ).toEqual([
      { kind: 'icon', src: '/assets/icons/equipment/rings.svg' },
      { kind: 'photo', src: 'https://x.b-cdn.net/a.jpg?width=96' },
    ]);
  });

  it('no iconKey → the brand photo (skips brands without one)', () => {
    expect(
      equipmentPillSources({ iconKey: undefined, brands: [{ brandName: 'A' }, { brandName: 'B', imageUrl: 'https://cdn/b.jpg' }] as never }),
    ).toEqual([{ kind: 'photo', src: 'https://cdn/b.jpg' }]);
  });

  it('nothing → empty (the dumbbell)', () => {
    expect(equipmentPillSources({ iconKey: undefined, brands: [] })).toEqual([]);
  });
});
