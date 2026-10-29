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
 *   RouteDrawerTour — enable_map_tutorial_v1 (board M7, L13): the workout drawer's blocks, the first time it opens.
 */
import { useEffect, useState } from 'react';
import FirstRunTour from '../FirstRunTour';
import { FIRST_RUN_COACH } from '../../services/first-run-tour';
import { useCoachTargetPresent as useTargetPresent } from '../../hooks/useCoachTargetPresent';
import type { AppGender } from '@/lib/utils/gendered-text';
import { useMapTutorialV1 } from '@/hooks/useMapTutorialV1';
import { MAP_TUTORIAL_COACH, pressRouteStart } from '../../services/map-tutorial-tour';

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
  // enable_map_tutorial_v1 (L9): the last button "יאללה, בואו נתחיל" also opens the route.
  const mapTutorialV1 = useMapTutorialV1();
  if (!armed && !latched) return null;
  return (
    <FirstRunTour
      tour="route"
      active={armed && ready}
      uid={uid}
      gender={gender}
      delayMs={900}
      onClose={(reason) => {
        setLatched(false);
        if (mapTutorialV1 && reason === 'done') pressRouteStart(document);
      }}
    />
  );
}

export function RoutePlayerTip({ armed, uid, gender }: TourHostProps) {
  const ready = useTargetPresent(FIRST_RUN_COACH.routePlayerControls, armed);
  if (!armed) return null;
  return <FirstRunTour tour="route-player" active={armed && ready} uid={uid} gender={gender} delayMs={1200} />;
}

/** Mounted by the hybrid workout drawer (HybridOverviewScreen); renders nothing with the flag off. */
export function RouteDrawerTour({ uid, gender }: Omit<TourHostProps, 'armed'>) {
  const armed = useMapTutorialV1();
  const ready = useTargetPresent(MAP_TUTORIAL_COACH.drawerStart, armed);
  if (!armed) return null;
  return <FirstRunTour tour="route-drawer" active={armed && ready} uid={uid} gender={gender} delayMs={900} />;
}
