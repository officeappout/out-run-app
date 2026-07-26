'use client';

/**
 * usePresenceStore — single shared subscription to the public presence tier
 * (`presence where mode == 'verified_global'`).
 *
 * P4 (perf/batch2): the discover map used to open this exact unbounded stream
 * TWICE concurrently — once in `useGroupPresence` (map pins) and once in
 * `usePartnerData` (partner-finder live list). Every presence doc change fired
 * two independent Firestore snapshots. This store opens ONE ref-counted
 * onSnapshot and hands the raw docs to every consumer; each consumer keeps its
 * own client-side transform. When the last consumer releases, the stream closes.
 *
 * The query shape (`where('mode','==','verified_global')`) is preserved verbatim
 * so the Firestore rule (`resource.data.mode == 'verified_global'`) stays
 * statically satisfiable — rules are not filters. The group-session presence
 * path (`mode=='group'` + array-contains) is intentionally NOT routed through
 * here; it has a different, member-scoped shape and keeps its own listener.
 *
 * This store is only ever acquired behind `IS_PERF_BATCH2_PRESENCE_ENABLED` at the call
 * sites; when that flag is off each consumer keeps its own onSnapshot and this
 * store is never mounted → byte-identical to pre-P4 behaviour.
 */

import { create } from 'zustand';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Volume cap for the verified_global presence stream. Without it a dense city
// streams EVERY public user's presence doc (unbounded — the raw stream drove
// heap + per-snapshot churn even though the map PAINT is throttled to 750ms).
// 200 covers a normal city fully (no-op there) and only bites pathological
// density.
// ⚠️ This caps VOLUME, not distance — Firestore returns the first N in default
// (doc-id) order, NOT the nearest N. True "nearby" needs a composite index
// (mode + geohash/lat, or mode + authorityId) + a geo/scope clause — a follow-up
// requiring an index deploy. `.limit()` leaves the query's `where` shape
// unchanged, so the verified_global rule stays satisfied (rules are not filters).
export const PRESENCE_STREAM_MAX = 200;

export type RawPresenceDoc = Record<string, any> & { uid: string };

interface PresenceStoreState {
  docs: RawPresenceDoc[];
}

export const usePresenceStore = create<PresenceStoreState>(() => ({
  docs: [],
}));

// Ref-counted single subscription — module-level, not React state, so it
// survives consumer re-renders and is shared across all hook instances.
let _refCount = 0;
let _unsub: (() => void) | null = null;

/**
 * Acquire the shared verified_global presence stream. Opens the single
 * onSnapshot on the first acquire; returns a release fn that closes it once the
 * last consumer releases. Safe to call from multiple hooks concurrently.
 */
export function acquirePresenceStream(): () => void {
  _refCount += 1;
  if (_refCount === 1) {
    const q = query(collection(db, 'presence'), where('mode', '==', 'verified_global'), limit(PRESENCE_STREAM_MAX));
    _unsub = onSnapshot(
      q,
      (snap) => {
        usePresenceStore.setState({
          docs: snap.docs.map((d) => ({ uid: d.id, ...d.data() })),
        });
      },
      (err: any) => {
        // Mirror the consumers' prior behaviour: surface permission-denied
        // (App Check / rules) loudly, stay quiet on transient network errors.
        if (err?.code === 'permission-denied') {
          console.error(
            '[presenceStore] verified_global listener PERMISSION-DENIED — check ' +
              'App Check (NEXT_PUBLIC_RECAPTCHA_SITE_KEY) + Firestore rules. Map ' +
              'partners + partner finder will be empty until fixed.',
            err,
          );
        } else {
          console.warn('[presenceStore] presence listener error:', err?.code ?? err);
        }
      },
    );
  }

  let released = false;
  return () => {
    if (released) return; // idempotent — a consumer must release at most once
    released = true;
    _refCount -= 1;
    if (_refCount <= 0) {
      _refCount = 0;
      _unsub?.();
      _unsub = null;
      usePresenceStore.setState({ docs: [] });
    }
  };
}
