import { describe, it, expect } from 'vitest';
import { deriveArenaAccess } from '../derive-arena-access';

// community/page.tsx passes `showHeOnly && declaration` into the access derivation.
const access = (showHeOnly: boolean) => deriveArenaAccess(undefined, true, showHeOnly && true, showHeOnly && true);

describe('unit / reserve league access follows the Hebrew-only rule', () => {
  it('shown (flag off or he): reserve + unit access as before', () => {
    const a = access(true);
    expect(a.hasReserveAccess).toBe(true);
    expect(a.hasUnitLeagueAccess).toBe(true);
  });
  it('hidden (flag on + en): no unit tab, no reserve scope', () => {
    const a = access(false);
    expect(a.hasReserveAccess).toBe(false);
    expect(a.hasUnitLeagueAccess).toBe(false);
    expect(a.activeTabs.some((t) => t.key === 'reserve')).toBe(false);
  });
});
