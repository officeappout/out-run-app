import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gearSectionOf, isPinnedHomeGear } from '../gear-sections';

// Real gear_definitions docs (hermetic corpus).
const doorBar = { id: '5Rkhxawxj8EwC4spTXVM', category: 'stationary', defaultLocation: 'home' }; // מתח לדלת
const parkBar = { id: 'Ljy39HSo3ikO9uFrBuEg', category: 'stationary', defaultLocation: 'park' }; // מתח בפארק
const chair = { category: 'improvised', defaultLocation: 'home' };
const band = { category: 'resistance' };

describe('equipment sheet sections — the door pull-up bar (enable_home_v2)', () => {
  it('flag OFF → today: the door bar sits under "ציוד פארק" (hidden in the profile editor)', () => {
    expect(gearSectionOf(doorBar, false)).toBe('park');
    expect(isPinnedHomeGear(doorBar, false)).toBe(false);
  });
  it('flag ON → the door bar is personal home gear, pinned first; park gear stays park', () => {
    expect(gearSectionOf(doorBar, true)).toBe('personal');
    expect(isPinnedHomeGear(doorBar, true)).toBe(true);
    expect(gearSectionOf(parkBar, true)).toBe('park');
    expect(isPinnedHomeGear(parkBar, true)).toBe(false);
  });
  it('the other sections are unchanged in both states', () => {
    for (const v2 of [false, true]) {
      expect(gearSectionOf(chair, v2)).toBe('improvised');
      expect(gearSectionOf(band, v2)).toBe('personal');
      expect(gearSectionOf({ defaultLocation: 'park' }, v2)).toBe('park');
    }
  });
  it('the sheet uses it only behind v2', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'components', 'EquipmentFilterSheet.tsx'), 'utf8');
    expect(src).toContain('if (v2) {');
    expect(src).toContain('gearSectionOf(g, true)');
    expect(src).toContain('}, [gear, v2]);');
  });
});
