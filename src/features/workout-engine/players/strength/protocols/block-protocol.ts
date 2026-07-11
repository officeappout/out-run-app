/**
 * block-protocol — resolves a segment's BLOCK-SCOPED protocol
 * (protocol-blocks Stage 2, 11.07.2026).
 *
 * Block-scoped protocols (tabata/emom/amrap) own the whole segment with one
 * clock — segment.protocol IS the dispatch key and protocolConfig is
 * required. An invalid/missing config falls back to the exercise-scoped
 * flow with a warn (never crash mid-workout on bad plan data).
 */
import type { WorkoutSegment } from '@/features/parks/core/types/route.types';
import type { TabataProtocolConfig } from '@/features/workout-engine/core/types/protocol.types';

export type BlockProtocolInfo = { id: 'tabata'; config: TabataProtocolConfig };
// Stage 3 widens this union: | { id: 'emom'; config: EmomProtocolConfig } | { id: 'amrap'; ... }

export function resolveBlockProtocol(segment: WorkoutSegment | undefined): BlockProtocolInfo | null {
  if (segment?.protocol !== 'tabata') return null;

  const cfg = segment.protocolConfig as TabataProtocolConfig | undefined;
  const valid =
    cfg &&
    typeof cfg.workSec === 'number' && cfg.workSec > 0 &&
    typeof cfg.restSec === 'number' && cfg.restSec >= 0 &&
    typeof cfg.rounds === 'number' && cfg.rounds > 0;

  if (!valid) {
    console.warn(
      `[Engine][Tabata] segment "${segment.id}" has protocol="tabata" but an invalid protocolConfig ` +
      `(${JSON.stringify(segment.protocolConfig ?? null)}) — falling back to exercise-scoped flow.`,
    );
    return null;
  }
  return { id: 'tabata', config: cfg };
}
