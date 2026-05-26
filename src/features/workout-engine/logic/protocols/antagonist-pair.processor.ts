/**
 * Antagonist Pair Processor — wraps the existing `applyAntagonistPairing`
 * sorting utility in a `ProtocolProcessor` so it can be dispatched via the
 * registry instead of being hard-coded into `WorkoutGenerator`.
 *
 * The actual pairing logic still lives in `workout-sorting.utils.ts` so it
 * can also be re-applied post-pipeline by `home-workout.service.ts` after
 * warmup/cooldown injection.
 */

import type { ProtocolProcessor } from './protocol.types';
import { applyAntagonistPairing } from '../workout-sorting.utils';

export const AntagonistPairProcessor: ProtocolProcessor = {
  name: 'antagonist_pair',
  matches: (protocolName) => protocolName === 'antagonist_pair',
  process: (exercises) => applyAntagonistPairing(exercises),
};
