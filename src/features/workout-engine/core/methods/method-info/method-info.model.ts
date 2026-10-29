/**
 * method-info.model — the data behind the method "i" sheet
 * (enable_method_info_sheet_v1, owner-approved canvas boards Method*, 29.10.2026).
 *
 * PURE. Every value the sheet shows comes from the block being explained:
 * the callers (preview list, player superset / tabata frames, timed header)
 * map their own rows into `MethodSource`, and this file only decides the
 * method, which cards the demo shows, and the numbers the copy needs.
 * Never a fixed example.
 */

import type { PyramidStep } from '../../../logic/workout-generator.types';
import type { WorkoutExercise as EngineWorkoutExercise } from '../../../logic/WorkoutGenerator';
import { classifyPyramidShape, pyramidLabel } from '../../../logic/protocols/pyramid.processor';
import { SUPERSET_TRANSITION_REST } from '../../../players/strength/hooks/useSupersetPredicates';

export type MethodKind = 'straight' | 'superset' | 'pyramidWave' | 'pyramidPeak' | 'tabata';

/** What the caller knows about one row of the block. */
export interface MethodSource {
  key: string;
  name: string;
  imageUrl: string;
  sets: number;
  restSec: number;
  /** Volume line under the name. Absent = the real ExerciseCard computes it from `exercise`. */
  line?: string;
  /** Preview only: the plan exercise itself, rendered by ExerciseCard as is. */
  exercise?: EngineWorkoutExercise;
  isUnilateral?: boolean;
  pyramidSequence?: PyramidStep[];
}

export interface MethodDemoItem {
  key: string;
  name: string;
  imageUrl: string;
  line?: string;
  exercise?: EngineWorkoutExercise;
  isUnilateral?: boolean;
  /** Pyramid: the real step and its index in the sequence. */
  step?: PyramidStep;
  stepIdx?: number;
}

export interface MethodTabataInfo {
  workSec: number;
  restSec: number;
  /** Total intervals in the block. */
  rounds: number;
  members: number;
  /** Whole passes over the members, or null when the intervals don't split evenly. */
  cycles: number | null;
  totalSec: number;
}

export interface MethodInfoModel {
  kind: MethodKind;
  /** The block's own label (pyramids: pyramidLabel of the real sequence). */
  label: string;
  items: MethodDemoItem[];
  /** Rest after a set / after the pair / between pyramid steps. */
  restSec: number;
  /** Superset: the short rest between the two exercises. */
  shortRestSec?: number;
  /** Straight sets: how many sets the first exercise has. */
  sets?: number;
  /** Pyramid wave: the targets on the way back down, in order. */
  pyramidTail?: number[];
  /** Pyramid: the peak step's target and unit. */
  peakTarget?: number;
  peakUnit?: 'reps' | 'hold';
  tabata?: MethodTabataInfo;
}

/** How many cards the demo shows at most (the sheet has to fit one phone screen). */
export const MAX_DEMO_ITEMS = 4;

const target = (s: PyramidStep): number | undefined => s.targetHold ?? s.targetReps;

/**
 * Index of the hardest step: the highest level when the processor wrote
 * levels, else the lowest target (fewest reps = hardest variant).
 */
export function pyramidPeakIndex(seq: ReadonlyArray<PyramidStep>): number {
  let best = 0;
  if (seq.some((s) => s.level != null)) {
    seq.forEach((s, i) => {
      if ((s.level ?? -Infinity) > (seq[best].level ?? -Infinity)) best = i;
    });
    return best;
  }
  seq.forEach((s, i) => {
    const v = target(s);
    const b = target(seq[best]);
    if (v != null && (b == null || v < b)) best = i;
  });
  return best;
}

function toItem(src: MethodSource): MethodDemoItem {
  return {
    key: src.key,
    name: src.name,
    imageUrl: src.imageUrl,
    line: src.line,
    exercise: src.exercise,
    isUnilateral: src.isUnilateral,
  };
}

function buildPyramid(src: MethodSource, label?: string): MethodInfoModel | null {
  const seq = src.pyramidSequence;
  if (!seq || seq.length === 0) return null;
  const shape = classifyPyramidShape(seq);
  const peak = shape === 'wave' ? pyramidPeakIndex(seq) : seq.length - 1;
  const from = Math.max(0, peak - (MAX_DEMO_ITEMS - 1));
  const items = seq.slice(from, peak + 1).map((step, i) => ({
    key: `${src.key}-step-${from + i}`,
    name: step.name || src.name,
    imageUrl: step.imageUrl || src.imageUrl,
    exercise: src.exercise,
    isUnilateral: src.isUnilateral,
    step,
    stepIdx: from + i,
  }));
  const tail = shape === 'wave'
    ? seq.slice(peak + 1).map(target).filter((v): v is number => v != null)
    : [];
  return {
    kind: shape === 'wave' ? 'pyramidWave' : 'pyramidPeak',
    label: label ?? pyramidLabel(seq),
    items,
    restSec: src.restSec,
    pyramidTail: tail,
    peakTarget: target(seq[peak]),
    peakUnit: seq[peak].targetHold != null ? 'hold' : 'reps',
  };
}

export interface BuildMethodInfoArgs {
  /** The block as the caller knows it. 'pyramid' resolves to wave / peak from the real sequence. */
  kind: 'straight' | 'superset' | 'pyramid' | 'tabata';
  label: string;
  sources: MethodSource[];
  /**
   * Tabata only: the block's clock. `cycles` = rounds per member when the
   * caller already knows it (the player's rows carry it as `sets`).
   */
  tabata?: { workSec: number; restSec: number; rounds: number; cycles?: number | null };
}

export function buildMethodInfo({ kind, label, sources, tabata }: BuildMethodInfoArgs): MethodInfoModel | null {
  if (sources.length === 0) return null;
  const first = sources[0];

  if (kind === 'pyramid') {
    const withSeq = sources.find((s) => (s.pyramidSequence?.length ?? 0) > 0);
    return withSeq ? buildPyramid(withSeq) : null;
  }

  if (kind === 'superset') {
    if (sources.length < 2) return null;
    const pair = sources.slice(0, 2);
    return {
      kind,
      label,
      items: pair.map(toItem),
      // The full rest the state machine uses after B is the segment rest of the pair.
      restSec: pair[1].restSec || first.restSec,
      shortRestSec: SUPERSET_TRANSITION_REST,
    };
  }

  if (kind === 'tabata') {
    if (!tabata) return null;
    const cost = sources.reduce((s, src) => s + (src.isUnilateral ? 2 : 1), 0);
    return {
      kind,
      label,
      items: sources.slice(0, MAX_DEMO_ITEMS).map(toItem),
      restSec: tabata.restSec,
      tabata: {
        workSec: tabata.workSec,
        restSec: tabata.restSec,
        rounds: tabata.rounds,
        members: sources.length,
        cycles:
          tabata.cycles !== undefined
            ? tabata.cycles
            : cost > 0 && tabata.rounds % cost === 0 ? tabata.rounds / cost : null,
        totalSec: tabata.rounds * (tabata.workSec + tabata.restSec),
      },
    };
  }

  // A straight-sets block whose row is really a pyramid explains the pyramid.
  if (first.pyramidSequence?.length) return buildPyramid(first);
  return {
    kind: 'straight',
    label,
    items: [toItem(first)],
    restSec: first.restSec,
    sets: Math.max(1, first.sets),
  };
}

/**
 * The demo's loop: which card is lit and which rest bar drains, step by step.
 * `rest` indexes the bars the demo draws (see MethodDemo).
 */
export type DemoPhase = { card: number | null; rest: number | null };

export function demoPhases(model: MethodInfoModel): DemoPhase[] {
  const n = model.items.length;
  switch (model.kind) {
    case 'superset':
      // A, short rest, B, long rest.
      return [
        { card: 0, rest: null },
        { card: null, rest: 0 },
        { card: 1, rest: null },
        { card: null, rest: 1 },
      ];
    case 'straight': {
      // Set, rest, set, rest ... for the block's own number of sets (capped so the loop stays short).
      const sets = Math.min(model.sets ?? 1, 4);
      const out: DemoPhase[] = [];
      for (let i = 0; i < sets; i++) {
        out.push({ card: 0, rest: null });
        if (i < sets - 1) out.push({ card: null, rest: 0 });
      }
      return out;
    }
    case 'tabata':
      // Every member works, then the shared rest bar drains, then the next member.
      return Array.from({ length: n }, (_, i) => [
        { card: i, rest: null },
        { card: null, rest: 0 },
      ]).flat();
    default:
      // Pyramid: each step, with the rest bar after the first one.
      return Array.from({ length: n }, (_, i) =>
        i === 0 && n > 1 ? [{ card: 0, rest: null }, { card: null, rest: 0 }] : [{ card: i, rest: null }],
      ).flat();
  }
}
