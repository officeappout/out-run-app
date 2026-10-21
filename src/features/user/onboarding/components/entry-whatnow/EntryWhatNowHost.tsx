'use client';

/**
 * EntryWhatNowHost — mounts the step 2 drawer on the map (enable_entry_whatnow_v1).
 * Flag off or no entry-v2 landing → renders nothing and reads nothing.
 *
 *   route → `onRoute` (the map opens its existing "מה עושים היום?" carousel; the settle-preview
 *           draws the suggested route with its strength stops)
 *   plan  → /home (the strength / run start cards built by the schedule chat)
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
  const state = useEntryWhatNow({ enabled, landing, uid, position, route, blocked });

  const onAnswer = (a: WhatNowAnswer) => {
    state.answer(a);
    onAnswered?.(a);
    if (a === 'route') onRoute();
    else if (a === 'plan') {
      markWhatNowPlanArrival(typeof window !== 'undefined' ? window.sessionStorage : null);
      router.push('/home');
    } else if (a === 'kelly') router.push(WHATNOW_KELLY_URL);
  };

  return (
    <WhatNowDrawer
      open={state.open}
      layout={state.layout}
      routeCopy={state.routeCopy}
      routeMapUrl={whatNowMiniMapUrl(state.routeCenter, process.env.NEXT_PUBLIC_MAPBOX_TOKEN)}
      showKelly={kellyAvailable}
      onAnswer={onAnswer}
    />
  );
}
