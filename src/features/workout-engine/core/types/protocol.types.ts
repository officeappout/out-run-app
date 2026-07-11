/**
 * protocol.types — shared protocol vocabulary for generator ↔ hybrid ↔ player
 * (protocol-blocks Stage 1c, 11.07.2026 — TYPES ONLY, no runtime code).
 *
 * TWO PROTOCOL CLASSES:
 * - exercise-scoped ('straight' | 'superset' | 'pyramid'): coexist inside one
 *   segment; segment.protocol for them is summary/UI metadata — the player
 *   dispatches per exercise (advance-registry legacy derivation).
 * - block-scoped ('tabata' | 'emom' | 'amrap'): one clock owns the segment;
 *   segment.protocol IS the dispatch key and protocolConfig is required.
 *
 * Absent protocol field = legacy plan → per-exercise derivation. Old plans in
 * sessionStorage need no migration, ever.
 */

export type SegmentProtocolId =
  | 'straight'
  | 'superset'
  | 'pyramid'
  | 'tabata'
  | 'emom'
  | 'amrap';

export const BLOCK_SCOPED_PROTOCOLS = ['tabata', 'emom', 'amrap'] as const;
export type BlockScopedProtocolId = (typeof BLOCK_SCOPED_PROTOCOLS)[number];

// ── Round items — the future-proof union ─────────────────────────────────────
// A round item is a strength exercise OR an aerobic leg (e.g. run 300m and
// come back — "מסע ספורטק"). The union exists TODAY so AMRAP round lists need
// zero migration when aerobic legs are implemented; until then heads skip
// aerobic_leg items with a log note.

export interface AerobicLegSpec {
  /** Target distance in meters (e.g. 300). Mutually optional with durationSec. */
  distanceM?: number;
  /** Target duration in seconds. */
  durationSec?: number;
  /** Display label, e.g. "ריצה 300מ׳". */
  label?: string;
}

export interface AerobicLegResult {
  completed: boolean;
  actualDistanceM?: number;
  actualDurationSec?: number;
  avgPaceSecPerKm?: number;
}

export type RoundItem =
  | {
      kind: 'exercise';
      exerciseId: string;
      targetReps?: number;
      targetHoldSec?: number;
    }
  | ({ kind: 'aerobic_leg' } & AerobicLegSpec);

/**
 * The aerobic-leg seam (design-only): the strength player receives this
 * handler as an optional prop. undefined = feature not wired → heads skip
 * aerobic_leg items. Future flow routes through useSessionStore.switchMode
 * (hybrid pattern); GPS/geofence/abort stay abstracted behind the Promise.
 */
export type AerobicLegHandler = (spec: AerobicLegSpec) => Promise<AerobicLegResult>;

// ── Per-protocol configs ─────────────────────────────────────────────────────

export interface TabataProtocolConfig {
  /** Work interval in seconds (classic: 20). */
  workSec: number;
  /** Rest interval in seconds (classic: 10). */
  restSec: number;
  /** Total work intervals (classic: 8). */
  rounds: number;
}

export interface EmomProtocolConfig {
  /** Interval length in seconds (classic: 60). */
  intervalSec: number;
  /** Total intervals in the block. */
  totalIntervals: number;
  /** Per-interval targets; cycled round-robin when shorter than totalIntervals. */
  targets?: RoundItem[];
}

export interface AmrapProtocolConfig {
  /** Time cap for the whole block, in seconds. */
  capSec: number;
  /** One round's item list — repeated as many times as the cap allows. */
  roundItems: RoundItem[];
}

export type SegmentProtocolConfig =
  | TabataProtocolConfig
  | EmomProtocolConfig
  | AmrapProtocolConfig;

/** Discriminated pairing of protocol id + its config (block-scoped only). */
export type SegmentProtocolSpec =
  | { protocol: 'straight' | 'superset' | 'pyramid'; config?: never }
  | { protocol: 'tabata'; config: TabataProtocolConfig }
  | { protocol: 'emom'; config: EmomProtocolConfig }
  | { protocol: 'amrap'; config: AmrapProtocolConfig };

/** Aligned to the hybrid branch's SessionSegmentKind ('aerobic' | 'strength'). */
export type SegmentKind = 'strength' | 'aerobic';
