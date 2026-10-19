'use client';

import { useState, useEffect, useMemo } from 'react';
import { getPark } from '@/features/parks/core/services/parks.service';
import { logParkDetailTripwireIfIncomplete } from '@/features/parks/core/services/park-detail-completeness';
import { getReviewsForPark, getReviewerNames } from '@/features/parks/core/services/contribution.service';
import { getGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import type { Park } from '@/features/parks/core/types/park.types';
import type { UserContribution } from '@/types/contribution.types';
import { categorizeParkEquipment } from '../utils/park-detail-logic';

/**
 * SPEC-07 redesign (17.09.2026): the sheet owns its own data completeness
 * instead of trusting whatever shape its caller's `selectedPark` happens to
 * be (catalog-lean from a map pin click, full from search/home-card) — that
 * per-caller discipline is exactly what silently broke once already. Always
 * point-fetches on open/park-change; falls back to `selectedPark` only while
 * in flight or if the fetch itself fails.
 */
export function usePointFetchedPark(isOpen: boolean, selectedPark: Park | null) {
  const [fetchedPark, setFetchedPark] = useState<Park | null>(null);
  useEffect(() => {
    if (!isOpen || !selectedPark?.id) { setFetchedPark(null); return; }
    let cancelled = false;
    setFetchedPark(null);
    getPark(selectedPark.id)
      .then((full) => { if (!cancelled) setFetchedPark(full); })
      .catch((err) => {
        console.warn('[ParkDetailSheet] Self point-fetch failed, falling back to caller-supplied park:', err);
      });
    return () => { cancelled = true; };
  }, [isOpen, selectedPark?.id]);

  const park = fetchedPark ?? selectedPark;

  // TRIPWIRE — fires only on the fallback path (point-fetch above hasn't
  // resolved yet, or failed) when the fallback object is missing a
  // detail-critical field it's about to render. Silent degrade is the
  // dangerous kind; this makes it loud instead. Logic lives in
  // park-detail-completeness.ts (pure, unit-tested).
  useEffect(() => {
    if (!isOpen || !park || fetchedPark) return;
    logParkDetailTripwireIfIncomplete(park, 'point-fetch not yet resolved or failed');
  }, [isOpen, park, fetchedPark]);

  return park;
}

/**
 * The park's reviews + reviewer display names. Names are resolved from
 * userPublic (never the raw uid — see getReviewerNames' own doc comment) and
 * re-resolved whenever `reviews` changes (new fetch, or the live refresh
 * after a submit). The list starts collapsed (`reviewsExpanded`), reset on
 * close / park change.
 */
export function useParkReviews(isOpen: boolean, parkId: string | undefined) {
  const [reviews, setReviews] = useState<UserContribution[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({});
  const [reviewsExpanded, setReviewsExpanded] = useState(false);

  useEffect(() => {
    if (!isOpen || !parkId) { setReviews([]); setReviewsExpanded(false); return; }
    setReviewsLoading(true);
    getReviewsForPark(parkId)
      .then(setReviews)
      .catch(err => console.error('[ParkDetailSheet] Reviews load failed:', err))
      .finally(() => setReviewsLoading(false));
  }, [isOpen, parkId]);

  useEffect(() => {
    const uids = reviews.map((r) => r.userId).filter(Boolean) as string[];
    if (uids.length === 0) { setReviewerNames({}); return; }
    let cancelled = false;
    getReviewerNames(uids).then((names) => {
      if (!cancelled) setReviewerNames(names);
    });
    return () => { cancelled = true; };
  }, [reviews]);

  return { reviews, setReviews, reviewsLoading, reviewerNames, reviewsExpanded, setReviewsExpanded };
}

/**
 * Resolve `park.gymEquipment` ids → full GymEquipment docs so the "מתקנים"
 * grid can render the SVG icon (iconKey) + Hebrew name. The stored
 * `ParkGymEquipment` only carries equipmentId + brandName, so this fans out
 * one Firestore read per id (typically <10 per park). Cancellable in case
 * the user opens a different park before the previous fetch resolves.
 */
export function useParkEquipment(isOpen: boolean, park: Park | null) {
  const [parkEquipment, setParkEquipment] = useState<GymEquipment[]>([]);

  const equipmentSections = useMemo(() => categorizeParkEquipment(parkEquipment), [parkEquipment]);

  useEffect(() => {
    if (!isOpen || !park?.gymEquipment?.length) {
      setParkEquipment([]);
      return;
    }
    let cancelled = false;
    const ids = park.gymEquipment.map((e) => e.equipmentId).filter(Boolean);
    Promise.all(ids.map((id) => getGymEquipment(id).catch(() => null)))
      .then((items) => {
        if (cancelled) return;
        setParkEquipment(items.filter((x): x is GymEquipment => x !== null));
      })
      .catch((err) => {
        if (!cancelled) console.error('[ParkDetailSheet] Equipment load failed:', err);
      });
    return () => { cancelled = true; };
  }, [isOpen, park?.id, park?.gymEquipment]); // eslint-disable-line react-hooks/exhaustive-deps

  return { parkEquipment, equipmentSections };
}
