import { describe, it, expect } from 'vitest';
import { resolveTabataFinisher, DEFAULT_TABATA_PROBABILITY } from '../tabata-finisher.utils';

/**
 * The whole point of the union track (David 26.07): tabata is a cross-program
 * finisher and must NOT be swallowed by the winner-takes-all main-protocol slot.
 * Candidates arrive in priority order (scheduled → primary → level-desc).
 */
describe('resolveTabataFinisher — union track', () => {
  it('NOT SWALLOWED: antagonist_pair wins the main slot on the higher-priority program, but a lower-priority program enables tabata → the finisher still resolves', () => {
    const finisher = resolveTabataFinisher([
      { source: 'push@L18', preferredProtocols: ['antagonist_pair', 'pyramid'], protocolProbability: 0.2 },
      { source: 'fullbody@L10', preferredProtocols: ['tabata'], protocolProbability: 0.3 },
    ]);
    expect(finisher).toEqual({ probability: 0.3, source: 'fullbody@L10' });
  });

  it('highest-priority enabler wins (NOT max-probability): winner also enables tabata → one finisher, from the winner', () => {
    expect(
      resolveTabataFinisher([
        { source: 'push@L18', preferredProtocols: ['antagonist_pair', 'tabata'], protocolProbability: 0.2 },
        { source: 'fullbody@L10', preferredProtocols: ['tabata'], protocolProbability: 0.5 }, // higher p, lower priority
      ]),
    ).toEqual({ probability: 0.2, source: 'push@L18' });
  });

  it('antagonist_pair boost does NOT leak — the finisher reads the RAW protocolProbability', () => {
    // Same program is the main winner (antagonist→1.0 applied elsewhere) AND the
    // tabata enabler. The finisher must use the doc's raw 0.2, not 1.0.
    expect(
      resolveTabataFinisher([
        { source: 'push@L18', preferredProtocols: ['antagonist_pair', 'tabata'], protocolProbability: 0.2 },
      ]),
    ).toEqual({ probability: 0.2, source: 'push@L18' });
  });

  it('no enrolled program enables tabata → null', () => {
    expect(
      resolveTabataFinisher([
        { source: 'push@L18', preferredProtocols: ['pyramid'], protocolProbability: 0.2 },
        { source: 'pull@L12', preferredProtocols: ['antagonist_pair'] },
      ]),
    ).toBeNull();
    expect(resolveTabataFinisher([])).toBeNull();
  });

  it('enabler with unset protocolProbability → default', () => {
    expect(resolveTabataFinisher([{ source: 'x@L5', preferredProtocols: ['tabata'] }]))
      .toEqual({ probability: DEFAULT_TABATA_PROBABILITY, source: 'x@L5' });
  });
});
