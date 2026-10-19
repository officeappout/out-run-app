'use client';

/**
 * Wires the run overview's edits (boards M-7a / 7b / 7c, enable_home_v2):
 * the axis decorations (tappable paces, the main set's "החלף" / "הוחלף ·
 * בטל") and the two sheets ("התאם קצב", "החלף מקטע"). The edits themselves
 * live with the host (RunEdits); this only opens sheets and reports changes.
 * Without `onEditsChange` the overview is read-only (decorations off).
 */

import { useMemo, useState, type ReactNode } from 'react';
import type { AxisDecorations } from '@/features/parks/core/components/overview/axis/axis-decor';
import { encodeMainSet, readMainSet } from '../../../utils/run-overview/run-main-set';
import { paceEditTarget } from '../../../utils/run-overview/run-pace-override';
import { withPace, withSwap, type RunEdits } from '../../../utils/run-overview/run-edits';
import type RunWorkout from '../../../types/run-workout.type';
import type { RunOverviewModel } from '../useRunOverviewModel';
import EditablePace from './EditablePace';
import { SwapButton, SwappedNote } from './MainSwapControls';
import RunPaceEditSheet from './RunPaceEditSheet';
import RunSwapBlockSheet from './RunSwapBlockSheet';

const MAIN_LEG = 'main-0';
const EASY_COLOR = '#84cc16';
const WORK_COLOR = '#e5484d';

export interface RunOverviewEditor {
  decorations: AxisDecorations | undefined;
  sheets: ReactNode;
}

export function useRunOverviewEditor(
  workout: RunWorkout,
  om: RunOverviewModel | null,
  edits: RunEdits,
  onEditsChange?: (edits: RunEdits) => void,
): RunOverviewEditor {
  const [paceKey, setPaceKey] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);

  const target = useMemo(() => {
    if (!om || !paceKey) return null;
    try {
      return paceEditTarget(om.active.blocks, paceKey, om.pace.ctx);
    } catch {
      return null;
    }
  }, [om, paceKey]);

  const mainColor = useMemo(() => {
    const leg = om?.legs.find((l) => l.key === MAIN_LEG);
    return (leg?.kind === 'group' && leg.color) || WORK_COLOR;
  }, [om]);

  const decorations = useMemo<AxisDecorations | undefined>(() => {
    if (!onEditsChange || !om) return undefined;
    return {
      renderPace: (slot) => <EditablePace slot={slot} onEdit={setPaceKey} />,
      groupExtras: (leg) => {
        if (leg.key !== MAIN_LEG) return null;
        return {
          action: om.swapGroups ? <SwapButton onClick={() => setSwapOpen(true)} /> : undefined,
          note: om.swap ? <SwappedNote from={om.swap.from} onUndo={() => onEditsChange(withSwap(edits, null))} /> : undefined,
        };
      },
    };
  }, [om, edits, onEditsChange]);

  if (!onEditsChange || !om) return { decorations: undefined, sheets: null };

  const swapTo = (key: string) => {
    // Back to the plan's own set at the planned level = no swap at all.
    const planned = readMainSet(workout.blocks);
    const isPlanned = planned && encodeMainSet(planned.spec) === key && edits.variant === 'planned';
    onEditsChange(withSwap(edits, isPlanned ? null : key));
    setSwapOpen(false);
  };

  return {
    decorations,
    sheets: (
      <>
        <RunPaceEditSheet
          target={target}
          color={paceKey?.startsWith('main.') ? mainColor : EASY_COLOR}
          onSave={(key, band) => {
            onEditsChange(withPace(edits, key, band));
            setPaceKey(null);
          }}
          onClose={() => setPaceKey(null)}
        />
        <RunSwapBlockSheet
          open={swapOpen && !!om.swapGroups}
          groups={om.swapGroups ?? []}
          color={mainColor}
          onSwap={swapTo}
          onClose={() => setSwapOpen(false)}
        />
      </>
    ),
  };
}
