'use client';

import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export interface MyMilitaryDeclaration {
  isReserve: boolean;
  orgId: string | null;
  unitPathIds: string[];
}

const EMPTY: MyMilitaryDeclaration = { isReserve: false, orgId: null, unitPathIds: [] };

/**
 * Live view of the current user's own military_declarations doc — a real-
 * time onSnapshot listener, not a one-time getDoc: the reserve league tab
 * must appear immediately after PersonaQuestionsDrawer saves the
 * declaration (David, production test 04.09.2026 — "the moment you hit
 * finish, not after a refresh"), and the write and this read can happen
 * from completely different screens/times in the same session (the persona
 * is usually declared from Settings or onboarding, not from /community
 * itself). A live listener catches the change wherever/whenever it happens;
 * a getDoc()-plus-refreshKey pattern (as used elsewhere, e.g.
 * useResolvedPersonaSummary) would require that caller to know when to
 * bump the key, which this cross-screen case makes unreliable.
 *
 * Originally just a boolean (`useHasDeclaredReserveStatus`, Phase 6a) — now
 * also exposes `orgId`/`unitPathIds` (Phase 6b) so the unit-league screen
 * can filter "battalions in MY brigade" / "companies in MY battalion"
 * without a second listener on the same document. `isReserve` alone is
 * still what gates the individual reserve league tab (§ useArenaAccess) —
 * unrelated to whether org/unit was ever filled in.
 *
 * Deliberately NOT folded into useArenaAccess() itself — see that hook's
 * own comment for why a listener scoped to just this one consumer
 * (currently /community) is the right footprint, not a global one.
 *
 * Firestore's local-cache-first writes mean this fires on the SAME client's
 * own just-completed write essentially immediately (optimistic local
 * update), before any server round-trip or Cloud Function involvement —
 * so this is also correctly independent of whether militaryReserveLeague's
 * join CF (or unitLeagueRollup) has run yet.
 *
 * Tracks auth.onAuthStateChanged explicitly (not just auth.currentUser at
 * mount) — the profile store is known to hydrate before Firebase Auth
 * attaches in this app (see useDailyActivity.ts's authReady gate for the
 * same fix applied to a different hook); relying on auth.currentUser at
 * mount alone has previously caused a silent-forever-false bug elsewhere.
 */
export function useMyMilitaryDeclaration(): MyMilitaryDeclaration {
  const [declaration, setDeclaration] = useState<MyMilitaryDeclaration>(EMPTY);
  const docUnsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      docUnsubRef.current?.();
      docUnsubRef.current = null;

      if (!user) {
        setDeclaration(EMPTY);
        return;
      }
      docUnsubRef.current = onSnapshot(
        doc(db, 'military_declarations', user.uid),
        (snap) => {
          const data = snap.data();
          setDeclaration({
            isReserve: data?.status === 'reserve',
            orgId: (data?.orgId as string | undefined) ?? null,
            unitPathIds: Array.isArray(data?.unitPathIds) ? (data!.unitPathIds as string[]) : [],
          });
        },
        () => setDeclaration(EMPTY),
      );
    });

    return () => {
      docUnsubRef.current?.();
      unsubAuth();
    };
  }, []);

  return declaration;
}
