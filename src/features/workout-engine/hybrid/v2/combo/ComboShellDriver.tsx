'use client';

/**
 * ComboShellDriver — drives the two-layer shell for the combo choreography (enable_combo_flow_v1,
 * boards PlayerTransitionStart / Station / Walk): on "reveal" it drops the player so the session
 * list behind shows, and when the run ends ("open" or skipped) it brings the player back up. It
 * only lifts a player it dropped itself, so a user who pulled the list down keeps it. Renders nothing.
 */

import { useEffect, useRef } from 'react';
import { useComboFlow } from './ComboFlowContext';

interface Props {
  isMinimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
}

export default function ComboShellDriver({ isMinimized, onMinimize, onExpand }: Props) {
  const { on, stage } = useComboFlow();
  const droppedRef = useRef(false);

  useEffect(() => {
    if (!on) return;
    if (stage === 'reveal' || stage === 'move') {
      if (!isMinimized && !droppedRef.current) {
        droppedRef.current = true;
        onMinimize();
      }
      return;
    }
    // "open" or the run is over (null): lift what we dropped.
    if (droppedRef.current) {
      droppedRef.current = false;
      if (isMinimized) onExpand();
    }
  }, [on, stage, isMinimized, onMinimize, onExpand]);

  return null;
}
