import { describe, it, expect } from 'vitest';
import { resolveTabataFinisher, DEFAULT_TABATA_PROBABILITY } from '../tabata-finisher.utils';

/**
 * The whole point of the union track (David 26.07): tabata is a cross-program
 * finisher and must NOT be swallowed by the winner-takes-all main-protocol slot.
 * Candidates arrive in priority order (scheduled → primary → level-desc).
 */
describe('resolveTabataFinisher — union track', () => {
  it('NOT SWALLOWED: antagonist_pair wins the main slot on the higher-priority program, but a lower-priority program enables tabata → the finisher still resolves (from its DEDICATED tabataProbability)', () => {
    const finisher = resolveTabataFinisher([
      { source: 'push@L18', preferredProtocols: ['antagonist_pair', 'pyramid'], tabataProbability: undefined },
      { source: 'fullbody@L10', preferredProtocols: ['tabata'], tabataProbability: 0.3 },
    ]);
    expect(finisher).toEqual({ probability: 0.3, source: 'fullbody@L10' });
  });

  it('highest-priority enabler wins (NOT max-probability): winner also enables tabata → one finisher, from the winner', () => {
    expect(
      resolveTabataFinisher([
        { source: 'push@L18', preferredProtocols: ['antagonist_pair', 'tabata'], tabataProbability: 0.2 },
        { source: 'fullbody@L10', preferredProtocols: ['tabata'], tabataProbability: 0.5 }, // higher p, lower priority
      ]),
    ).toEqual({ probability: 0.2, source: 'push@L18' });
  });

  it('reads the DEDICATED tabataProbability field — independent of the main protocol on the same doc', () => {
    // A program that enables both antagonist_pair (main) and tabata: the finisher
    // takes tabataProbability (0.12), never the main protocolProbability.
    expect(
      resolveTabataFinisher([
        { source: 'push@L18', preferredProtocols: ['antagonist_pair', 'tabata'], tabataProbability: 0.12 },
      ]),
    ).toEqual({ probability: 0.12, source: 'push@L18' });
  });

  it('no enrolled program enables tabata → null', () => {
    expect(
      resolveTabataFinisher([
        { source: 'push@L18', preferredProtocols: ['pyramid'], tabataProbability: 0.2 }, // has a value but flag off
        { source: 'pull@L12', preferredProtocols: ['antagonist_pair'] },
      ]),
    ).toBeNull();
    expect(resolveTabataFinisher([])).toBeNull();
  });

  it('flag on but tabataProbability unset → conservative default', () => {
    expect(resolveTabataFinisher([{ source: 'x@L5', preferredProtocols: ['tabata'] }]))
      .toEqual({ probability: DEFAULT_TABATA_PROBABILITY, source: 'x@L5' });
  });
});
