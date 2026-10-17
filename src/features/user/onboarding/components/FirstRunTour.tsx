'use client';

/**
 * FirstRunTour — renders one first-run coach-mark tour (onboarding tutorial, slice 2).
 *
 * The caller decides WHEN the screen is calm enough (`active`: both flags on, no sheet / drawer
 * / workout up — the screen's own guard list); this component owns the seen-once flag
 * (onboardingPrefs, per tour + uid, same pattern as the hybrid station tutorial) and draws
 * CoachMarks in a body portal so no screen's stacking context can bury it.
 *
 * Steps whose `data-coach` target isn't on screen are dropped (a new user may not have a
 * weekly schedule yet). `onClose` fires exactly once per activation: 'done' / 'skip' (seen
 * flag written — "דלג" counts as seen), 'seen' (already seen), or 'empty' (nothing to point
 * at — NOT recorded, so a later visit can still show it).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CoachMarks, { type CoachMarkStep } from '@/components/ui/CoachMarks';
import { getOnboardingPrefAsync, setOnboardingPref } from '@/lib/onboardingPrefs';
import type { AppGender } from '@/lib/utils/gendered-text';
import {
  firstRunTourSeenKey, firstRunTourSteps, presentSteps, shouldShowFirstRunTour,
  type FirstRunTourId,
} from '../services/first-run-tour';

export type FirstRunTourCloseReason = 'done' | 'skip' | 'seen' | 'empty';

interface Props {
  tour: FirstRunTourId;
  /** The screen is calm (flags on + nothing else open). Rising edge starts the check. */
  active: boolean;
  uid: string | null | undefined;
  gender: AppGender | null | undefined;
  onClose?: (reason: FirstRunTourCloseReason) => void;
  /** Let the host's entry animation settle before measuring targets. */
  delayMs?: number;
}

function targetPresent(target: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector<HTMLElement>(`[data-coach="${target}"]`);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export default function FirstRunTour({ tour, active, uid, gender, onClose, delayMs = 600 }: Props) {
  const [steps, setSteps] = useState<CoachMarkStep[] | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closedRef = useRef(false);

  useEffect(() => {
    if (!active || steps || closedRef.current) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void getOnboardingPrefAsync(firstRunTourSeenKey(tour, uid)).then((seen) => {
      if (!alive) return;
      if (!shouldShowFirstRunTour({ enabled: true, seenValue: seen })) {
        closedRef.current = true;
        onCloseRef.current?.('seen');
        return;
      }
      timer = setTimeout(() => {
        if (!alive || !activeRef.current) return; // the screen got busy — wait for the next calm
        const shown = presentSteps(firstRunTourSteps(tour, gender), targetPresent);
        if (shown.length === 0) {
          closedRef.current = true;
          onCloseRef.current?.('empty');
          return;
        }
        setSteps(shown);
      }, delayMs);
    });
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [active, steps, tour, uid, gender, delayMs]);

  if (!steps || typeof document === 'undefined') return null;

  const finish = (reason: 'done' | 'skip') => {
    setOnboardingPref(firstRunTourSeenKey(tour, uid), reason); // skip = seen too
    closedRef.current = true;
    setSteps(null);
    onCloseRef.current?.(reason);
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000]" data-first-run-tour={tour}>
      <CoachMarks steps={steps} onFinish={finish} />
    </div>,
    document.body,
  );
}
