'use client';

/**
 * The entry flow's two coach-mark tours (enable_entry_whatnow_v1), both run by the existing
 * FirstRunTour (seen-once per user in onboardingPrefs, new users only, dark bubble chrome from
 * first-run-tour.ts):
 *
 *   RouteFirstTour  — designs R1–R3: when the floating route card first shows (the step-2 route
 *                     card, or any first generated route). The carousels only mark their focused
 *                     card once their cards are ready, so the host waits for that target to exist
 *                     (a "searching" loader has none) before it lets the tour measure.
 *   RoutePlayerTip  — design R6: one tip the first time the route player is running.
 */
import { useEffect, useState } from 'react';
import FirstRunTour from '../FirstRunTour';
import { FIRST_RUN_COACH } from '../../services/first-run-tour';
import type { AppGender } from '@/lib/utils/gendered-text';

const POLL_MS = 400;

function targetVisible(target: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector<HTMLElement>(`[data-coach="${target}"]`);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** True while `armed` and the target element is on screen (polled; stops when disarmed). */
function useTargetPresent(target: string, armed: boolean): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    if (!armed) { setPresent(false); return; }
    const tick = () => setPresent(targetVisible(target));
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [target, armed]);
  return present;
}

interface TourHostProps {
  /** Flag on + the screen this tour belongs to is up (the caller's own guard list). */
  armed: boolean;
  uid: string | null | undefined;
  gender: AppGender | null | undefined;
}

/**
 * Once the route tour is under way it stays mounted until the user finishes or skips it: the
 * map's `armed` guard list flips during the carousel's own settle (step / compose changes), and
 * unmounting there cut the tour off mid-step with no seen flag (owner note 21.10 #6).
 */
export function RouteFirstTour({ armed, uid, gender }: TourHostProps) {
  const ready = useTargetPresent(FIRST_RUN_COACH.routeCard, armed);
  const [latched, setLatched] = useState(false);
  useEffect(() => { if (armed && ready) setLatched(true); }, [armed, ready]);
  if (!armed && !latched) return null;
  return (
    <FirstRunTour
      tour="route"
      active={armed && ready}
      uid={uid}
      gender={gender}
      delayMs={900}
      onClose={() => setLatched(false)}
    />
  );
}

export function RoutePlayerTip({ armed, uid, gender }: TourHostProps) {
  const ready = useTargetPresent(FIRST_RUN_COACH.routePlayerControls, armed);
  if (!armed) return null;
  return <FirstRunTour tour="route-player" active={armed && ready} uid={uid} gender={gender} delayMs={1200} />;
}
