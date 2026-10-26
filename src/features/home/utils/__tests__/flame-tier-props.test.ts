import { describe, expect, it } from 'vitest';
import { ASSET_REGISTRY, type DayDisplayProps } from '../day-display.utils';
import { withFlameTier } from '../flame-tier-props';

const props = (src = ASSET_REGISTRY.flames.strength): DayDisplayProps => ({
  state: 'past',
  isSelected: false,
  container: { bgColor: '', bgOpacity: 0, borderColor: '', borderWidth: 0 },
  icon: { type: 'img', src },
  label: { text: '', color: '' },
  dots: [],
});

describe('withFlameTier', () => {
  it('adds the level and the started mark', () => {
    expect(withFlameTier(props(), { level: 2, started: false, stepsOnly: false })).toMatchObject({ flameLevel: 2, flameStarted: false });
  });
  it('a steps-only day gets the steps (orange) flame, not the program colour', () => {
    expect(withFlameTier(props(), { level: 1, started: false, stepsOnly: true }).icon.src).toBe(ASSET_REGISTRY.flames.steps);
  });
  it('non-flame icons are left alone', () => {
    const p = { ...props(), icon: { type: 'program' as const, iconKey: 'muscle' } };
    expect(withFlameTier(p, { level: 0, started: true, stepsOnly: false }).icon).toEqual(p.icon);
  });
});
