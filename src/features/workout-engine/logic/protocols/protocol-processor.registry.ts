/**
 * Protocol Processor Registry — single source of truth for all known
 * workout protocols.
 *
 * To support a new protocol (EMOM, Pyramid, Compound Superset, ...):
 *   1. Implement a new `ProtocolProcessor` in this folder.
 *   2. Append it to `PROTOCOL_REGISTRY` below.
 *
 * `WorkoutGenerator` resolves the active protocol via `findProcessor()`
 * — no changes to the generator are needed when adding new protocols.
 */

import type { ProtocolProcessor } from './protocol.types';
import { AntagonistPairProcessor } from './antagonist-pair.processor';
import { PyramidProcessor } from './pyramid.processor';

export const PROTOCOL_REGISTRY: ProtocolProcessor[] = [
  AntagonistPairProcessor,
  PyramidProcessor,
  // EMOMProcessor,             ← Phase 3
  // CompoundSupersetProcessor, ← Phase 3
];

/**
 * Returns the processor whose `matches()` predicate accepts the given
 * protocol name, or `undefined` for straight sets / unknown protocols.
 */
export function findProcessor(protocolName: string): ProtocolProcessor | undefined {
  return PROTOCOL_REGISTRY.find((p) => p.matches(protocolName));
}
