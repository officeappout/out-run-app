/**
 * hybrid-slots — the adaptive slot layer (Phase 1). PURE per LAW 0: no hooks,
 * no Firebase, no I/O. Unit-testable with plain inputs.
 *
 * A "slot" is a resolver-produced choice card on the map's "מה עושים היום?"
 * layer. Slots are HETEROGENEOUS: each slot names an EXISTING entry path it
 * drives — there is NO new session pipeline:
 *   • kind 'hybrid'         → composeHybridPlan(presetToIntent(preset)) → overview → run
 *   • kind 'aerobic_quick'  → logic.startActiveWorkout() immediately (skips overview)
 *
 * The 3-slot STRUCTURE is built now so nothing needs a rewrite later, but the
 * resolver fills only 2 REAL slots in Phase 1 (recommended balanced + aerobic
 * quick-start). The "brain" that personalises slot 1 (today's-strength / last /
 * weekly-gap) and the second-intensity slot arrive in Phase 3 / Phase 2.
 *
 * Presets are DECLARATIVE config only — a preset owns no code path; it maps to
 * a HybridStartIntent that the EXISTING composer consumes. Single source of the
 * split math stays the composer (EMPHASIS_AEROBIC_SHARE); this file only picks
 * which anchor a preset sits on and threads ⚡ → the engine's difficulty knob.
 */

import type { HybridStartIntent } from './build-hybrid-input';
import type { HybridEmphasis, AerobicKind } from './compose-hybrid-session.service';
import type { HybridShapeName } from './hybrid-shape';

export type SlotKind = 'hybrid' | 'aerobic_quick';

/** ⚡ intensity — reuses DifficultyBolts' 1|2|3 vocabulary. */
export type Bolts = 1 | 2 | 3;

type ResolvedEmphasis = Exclude<HybridEmphasis, 'weekly_smart'>;

// Aerobic = green · strength/brand = the running cyan. Modality convention from
// the hybrid overview inventory (green aerobic / amber strength); the recommended
// hybrid slot leads with the brand cyan.
const AER_GREEN = '#10B981';
const BRAND = '#00ADEF';

/**
 * Mirrors EMPHASIS_AEROBIC_SHARE (compose-hybrid-session.service.ts) — the SAME
 * three anchors, inverted (emphasis → share). The composer remains the single
 * source of the budget split; this only names the anchor a preset sits on.
 */
const EMPHASIS_TO_SHARE: Record<ResolvedEmphasis, number> = {
  aerobic: 0.7,
  balanced: 0.55,
  strength: 0.35,
};

/** A declarative hybrid preset (config only — no code path of its own). */
export interface HybridPreset {
  id: string;
  aerobicKind: AerobicKind;
  emphasis: ResolvedEmphasis;
  /** Phase 1 wires only 'sandwich'. Others are config stubs (hybrid-shape.ts). */
  shape: HybridShapeName;
  /** ⚡ — drives generationContext.difficulty (invariant B), NOT invented. */
  bolts: Bolts;
  /** Default budget when the slot flow has no goal UI (Phase 3 brain refines). */
  defaultTimeBudgetMin: number;
}

interface SlotBase {
  id: string;
  title: string;
  subtitle: string;
  bolts: Bolts;
  recommended: boolean;
  /** Accent hue for the card chrome (green aerobic / brand hybrid). */
  accent: string;
}

/** A slot that composes a hybrid plan through the existing engine. */
export interface HybridPresetSlot extends SlotBase {
  kind: 'hybrid';
  preset: HybridPreset;
  timeBudgetMin: number;
}

/** A slot that starts a plain aerobic session immediately (no overview). */
export interface AerobicQuickSlot extends SlotBase {
  kind: 'aerobic_quick';
  aerobicKind: AerobicKind;
}

export type HybridSlot = HybridPresetSlot | AerobicQuickSlot;

/** Environment the resolver reads — all caller-supplied, so the fn stays pure. */
export interface SlotEnv {
  hasGps: boolean;
  /** Parks near the user (0 ⇒ A3: hybrid still offered, station → bodyweight). */
  nearbyParkCount: number;
  /** Active activity toggle on the slot layer. */
  aerobicKind: AerobicKind;
  profileType?: 1 | 2 | 3 | 4;
}

/** Placeholder for the Phase-3 "brain" (last session / weekly gap). */
export interface SlotHistory {
  lastAerobicKind?: AerobicKind;
  hasHistory?: boolean;
}

/**
 * Declarative preset registry. Phase 1 surfaces only `*_balanced` (sandwich is
 * the sole wired shape). `*_fast` / `*_strength` are config stubs ready for the
 * full walking set (Phase 2); `run_core` (runner_collects + runner data tag) is
 * Phase 3.
 */
export const HYBRID_PRESETS: Record<string, HybridPreset> = {
  walk_balanced: { id: 'walk_balanced', aerobicKind: 'walking', emphasis: 'balanced', shape: 'sandwich', bolts: 2, defaultTimeBudgetMin: 30 },
  walk_fast:     { id: 'walk_fast',     aerobicKind: 'walking', emphasis: 'aerobic',  shape: 'sandwich', bolts: 1, defaultTimeBudgetMin: 30 }, // Phase 2
  walk_strength: { id: 'walk_strength', aerobicKind: 'walking', emphasis: 'strength', shape: 'sandwich', bolts: 3, defaultTimeBudgetMin: 35 }, // Phase 2
  run_balanced:  { id: 'run_balanced',  aerobicKind: 'running', emphasis: 'balanced', shape: 'sandwich', bolts: 2, defaultTimeBudgetMin: 35 }, // Phase 2
  // run_core: runner_collects shape (station at END, runner-appropriate tag) → Phase 3.
};

/** ⚡ → the engine's difficulty knob (invariant B — a real parameter). */
export function boltsToDifficulty(bolts: Bolts): number {
  return Math.min(3, Math.max(1, bolts));
}

/**
 * Pure preset → HybridStartIntent. `difficulty` is threaded from ⚡ so the card's
 * bolts actually drive generateStrengthBlock (via composeHybridPlan), rather than
 * the current hardcoded difficulty:2.
 */
export function presetToIntent(preset: HybridPreset, timeBudgetMin: number): HybridStartIntent {
  return {
    timeBudgetMin,
    aerobicShare: EMPHASIS_TO_SHARE[preset.emphasis],
    emphasis: preset.emphasis,
    aerobicKind: preset.aerobicKind,
    difficulty: boltsToDifficulty(preset.bolts),
  };
}

/**
 * The ONE place that decides which slots are offered + their order, given the
 * environment. Phase 1 emits exactly TWO real slots. A3 is never a silent empty:
 * the hybrid slot stays even with no known park nearby — the composer synthesises
 * a bodyweight station mid-route (compose-hybrid-session.service field fallback).
 */
export function resolveSlots(env: SlotEnv, _history?: SlotHistory): HybridSlot[] {
  const slots: HybridSlot[] = [];

  // ── Slot 1 — "מומלץ לך" (adaptive; Phase 1 = balanced sandwich per activity) ──
  const presetId = env.aerobicKind === 'running' ? 'run_balanced' : 'walk_balanced';
  const preset = HYBRID_PRESETS[presetId] ?? HYBRID_PRESETS.walk_balanced;
  const a3 = env.nearbyParkCount === 0; // no known station → bodyweight fallback
  slots.push({
    kind: 'hybrid',
    id: 'recommended',
    preset,
    timeBudgetMin: preset.defaultTimeBudgetMin,
    // Title = workout description; the "מומלץ" badge (recommended) carries the
    // recommendation — no duplicate "מומלץ לך" title.
    title: env.aerobicKind === 'running' ? 'ריצה + כוח' : 'הליכה + כוח',
    subtitle: a3
      ? 'משולב מאוזן · תחנת משקל-גוף בדרך'
      : 'משולב מאוזן · תחנת כוח בדרך',
    bolts: preset.bolts,
    recommended: true,
    accent: BRAND,
  });

  // ── Slot 2 — "עצימות אחרת" (second hybrid preset) → Phase 2 (structure ready) ──

  // ── Slot 3 — "חופשי / מהיר" (aerobic quick-start; skips the overview) ──
  slots.push({
    kind: 'aerobic_quick',
    id: 'aerobic_quick',
    aerobicKind: env.aerobicKind,
    title: env.aerobicKind === 'running' ? 'ריצה חופשית' : 'הליכה חופשית',
    subtitle: 'יוצאים מיד · בלי יעדים',
    bolts: 1,
    recommended: false,
    accent: AER_GREEN,
  });

  return slots;
}
