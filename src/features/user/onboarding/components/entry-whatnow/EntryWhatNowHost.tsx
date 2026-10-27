'use client';

/**
 * EntryWhatNowHost — mounts the step 2 drawer on the map (enable_entry_whatnow_v1).
 * Flag off or no entry-v2 landing → renders nothing and reads nothing.
 *
 *   route → `onRoute` (the map opens its existing "מה עושים היום?" carousel; the settle-preview
 *           draws the suggested route with its strength stops)
 *   plan  → running frozen: the strength signup (details screen, then the v3 questionnaire,
 *           owner 27.10.2026, strength-choice-route.ts); running open: /home's start cards
 *   kelly → /ai-coach?starter=entry (the chat with ready chips)
 *   browse / dismiss → just closes
 */
import { useRouter } from 'next/navigation';
import { useEntryWhatNow } from '../../hooks/useEntryWhatNow';
import {
  WHATNOW_KELLY_URL, markWhatNowPlanArrival, whatNowMiniMapUrl,
  type WhatNowAnswer, type WhatNowRouteSuggestion,
} from '../../services/entry-whatnow';
import WhatNowDrawer from './WhatNowDrawer';
import { useAerobicProgramsOpen } from '../../hooks/useAerobicProgramsOpen';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { hasKnownIdentity, seedOnboardingTrackEntry } from '../../utils/onboarding-entry';
import { isStrengthSignupHref, whatNowPlanHref } from '../../utils/strength-choice-route';
import { hasAnyProgram } from '@/lib/landing-fallback/fallback-routes';
import { useMapTutorialV1 } from '@/hooks/useMapTutorialV1';

export interface EntryWhatNowHostProps {
  enabled: boolean;
  landing: boolean;
  uid: string | null | undefined;
  position: { lat: number; lng: number } | null;
  route: WhatNowRouteSuggestion | null;
  blocked: boolean;
  /** Kelly is reachable for this user (AI access, or the unified team chat). */
  kellyAvailable: boolean;
  onRoute: () => void;
  /** Reports the answer (after it is recorded) — the map starts its own tour after browse / dismiss. */
  onAnswered?: (answer: WhatNowAnswer) => void;
}

export default function EntryWhatNowHost(props: EntryWhatNowHostProps) {
  if (!props.enabled || !props.landing) return null;
  return <EntryWhatNowInner {...props} />;
}

function EntryWhatNowInner({ enabled, landing, uid, position, route, blocked, kellyAvailable, onRoute, onAnswered }: EntryWhatNowHostProps) {
  const router = useRouter();
  const mapTutorialV1 = useMapTutorialV1();
  const state = useEntryWhatNow({ enabled, landing, uid, position, route, blocked, copyV1: mapTutorialV1 });
  const { open: aerobicOpen } = useAerobicProgramsOpen();
  const profile = useUserStore((s) => s.profile);

  const onAnswer = (a: WhatNowAnswer) => {
    state.answer(a);
    onAnswered?.(a);
    if (a === 'route') onRoute();
    else if (a === 'plan') {
      const href = whatNowPlanHref({
        aerobicOpen, hasProgram: hasAnyProgram(profile), identityKnown: hasKnownIdentity(profile),
      });
      if (isStrengthSignupHref(href)) seedOnboardingTrackEntry(profile, 'STRENGTH');
      else markWhatNowPlanArrival(typeof window !== 'undefined' ? window.sessionStorage : null);
      router.push(href);
    } else if (a === 'kelly') router.push(WHATNOW_KELLY_URL);
  };

  return (
    <WhatNowDrawer
      open={state.open}
      layout={state.layout}
      routeCopy={state.routeCopy}
      routeMapUrl={whatNowMiniMapUrl(state.routeCenter, process.env.NEXT_PUBLIC_MAPBOX_TOKEN)}
      showKelly={kellyAvailable}
      browseV1={mapTutorialV1}
      onAnswer={onAnswer}
    />
  );
}
