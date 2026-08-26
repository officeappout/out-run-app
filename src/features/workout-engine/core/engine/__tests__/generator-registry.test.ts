import { describe, it, expect } from 'vitest';
import { GENERATOR_REGISTRY } from '../generator-registry';
import { recoveryFollowUpGenerator } from '../../generators/recovery-follow-up.generator';
import { safetyNetGenerator } from '../../generators/safety-net.generator';

// 26.08.2026 tie-break fix (confirmed on-device): rankSuggestions' sort is stable and
// candidates are built in GENERATOR_REGISTRY's own array order (suggestion-engine.ts) — on a
// rest-day score tie (both goalTags:['recovery'], see rank-suggestions.test.ts's own regression
// test for the double-dip fix that made this tie possible), whichever of these two comes first
// in the registry wins the top slot. recoveryFollowUpGenerator must come first so a tie favors
// the real generated recovery workout over safety-net's generic last-resort fallback.
describe('GENERATOR_REGISTRY — tie-break order', () => {
  it('lists recoveryFollowUpGenerator before safetyNetGenerator', () => {
    const recoveryIndex = GENERATOR_REGISTRY.indexOf(recoveryFollowUpGenerator);
    const safetyNetIndex = GENERATOR_REGISTRY.indexOf(safetyNetGenerator);

    expect(recoveryIndex).toBeGreaterThanOrEqual(0);
    expect(safetyNetIndex).toBeGreaterThanOrEqual(0);
    expect(recoveryIndex).toBeLessThan(safetyNetIndex);
  });
});
