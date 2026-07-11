/**
 * tabata.constants — the ONE production tabata configuration
 * (protocol-blocks Stage 3.0, 12.07.2026).
 *
 * David's decision (12.07.2026): the config is the FIXED classic
 * 20s work / 10s rest × 8 rounds — not admin-editable in v1. The admin
 * controls WHETHER tabata can fire (preferredProtocols) and HOW OFTEN
 * (the shared protocolProbability slider); the shape itself is constant.
 *
 * Shared by the generator (block builder), the duration estimator
 * (fixed block pricing) and tests. The player never imports this — the
 * config travels inside the plan (segment.protocolConfig).
 */
import type { TabataProtocolConfig } from '@/features/workout-engine/core/types/protocol.types';

export const TABATA_CLASSIC: TabataProtocolConfig = Object.freeze({
  workSec: 20,
  restSec: 10,
  rounds: 8,
});

/** Fixed wall-clock cost of one classic block: (20+10)×8 = 240s. */
export const TABATA_BLOCK_SECONDS =
  (TABATA_CLASSIC.workSec + TABATA_CLASSIC.restSec) * TABATA_CLASSIC.rounds;

/** Block size limits — how many exercises rotate inside the block. */
export const TABATA_MIN_EXERCISES = 2;
export const TABATA_MAX_EXERCISES = 4;
