'use client';

import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { useUserStore } from '@/features/user';
import { auth } from '@/lib/firebase';
import { joinEvent, materializeVirtualSession } from '@/features/admin/services/community.service';
import { createPlannedSession } from '@/features/admin/services/planned-sessions.service';
import { createContribution, recomputeAndSaveParkRating, getReviewsForPark } from '@/features/parks/core/services/contribution.service';
import type { DayFilter, SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import type { Park } from '@/features/parks/core/types/park.types';
import type { UserContribution } from '@/types/contribution.types';
import { toLocalDateInputValue } from '../utils/park-detail-format';
import { resolveArrivalWindow, recurringEventDate, recurringEventTime } from '../utils/park-detail-logic';

/**
 * "אני מגיע ב..." — the arrival time-window picker state and the publish
 * write (a `planned_sessions` doc), plus the optimistic local arrivals that
 * show the row immediately, before the Firestore snapshot round-trip.
 */
export function useParkArrivalPublish(selectedPark: Park | null, dayFilter: DayFilter) {
  const [showTimePicker, setShowTimePicker] = useState(false);
  // Time-window state for the dual-range slider, in MINUTES from midnight
  // (0..1440) — the slider's numeric domain. Defaults to 17:00–19:00.
  const [timeRangeMinutes, setTimeRangeMinutes] = useState<[number, number]>([
    17 * 60,
    19 * 60,
  ]);
  // Date targeted in `week` mode (YYYY-MM-DD, bound to a native date input).
  // Defaults to tomorrow; `today`/`tomorrow` imply the date from the chip.
  const [pickedDate, setPickedDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toLocalDateInputValue(d);
  });
  const [publishingSession, setPublishingSession] = useState(false);
  // Cleared when the sheet closes (see the body-overflow effect in the sheet).
  const [localArrivals, setLocalArrivals] = useState<SessionEnrichment[]>([]);

  const handlePublishArrival = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !selectedPark) return;
    setPublishingSession(true);
    try {
      const arrivalWindow = resolveArrivalWindow(dayFilter, pickedDate, timeRangeMinutes);
      if (!arrivalWindow.ok) {
        console.warn('[ParkDetail] Invalid date input value:', pickedDate);
        return;
      }
      const { startTime, endTime } = arrivalWindow;

      // Reject windows that have already ended — there's no point
      // announcing an arrival for a slot that's already past.
      if (endTime.getTime() < Date.now()) {
        console.warn(
          '[ParkDetail] Rejecting publish — window ends in the past:',
          endTime.toISOString(),
        );
        return;
      }

      // Resolve the publisher's active strength program at write time so the
      // partner card can render the same "🎯 program · רמה N" line live cards
      // show (same field shape as useWorkoutPresence's heartbeat).
      const liveProfile = useUserStore.getState().profile;
      const activeProgram = liveProfile?.progression?.activePrograms?.[0];
      const programName = activeProgram?.name ?? undefined;
      const programLevel = activeProgram?.templateId
        ? liveProfile?.progression?.tracks?.[activeProgram.templateId]?.currentLevel
        : undefined;

      // parkId (NOT routeId) so `useParkEvents` can read this back via its
      // `where('parkId', '==', parkId)` planned_sessions subscription.
      await createPlannedSession({
        userId: user.uid,
        displayName: user.displayName ?? 'משתמש',
        photoURL: user.photoURL,
        parkId: selectedPark.id,
        // Denormalised label so PartnerCard can render "📍 פארק הלל"
        // without an extra Firestore round-trip.
        parkName: selectedPark.name,
        ...(programName ? { programName } : {}),
        ...(typeof programLevel === 'number' ? { programLevel } : {}),
        activityType: 'workout',
        level: 'beginner',
        startTime,
        endTime,
        // 'verified_global' (public tier) so the partner-finder listeners —
        // which gate on `where('mode', '==', 'verified_global')` — can surface
        // this arrival to non-followers (an open "I'm coming" announcement).
        privacyMode: 'verified_global',
        lat: selectedPark.location?.lat ?? null,
        lng: selectedPark.location?.lng ?? null,
      });
      setShowTimePicker(false);
      const displayName = user.displayName ?? 'משתמש';
      setLocalArrivals((prev) => [
        ...prev,
        {
          eventId: `local-arrival-${user.uid}-${Date.now()}`,
          eventLabel: displayName,
          nextStartTime: startTime.toISOString(),
          currentRegistrations: 1,
          plannedCount: 1,
          avatars: [{
            uid: user.uid,
            name: displayName,
            photoURL: user.photoURL ?? undefined,
          }],
          isPersonalArrival: true,
        },
      ]);
    } catch (err) {
      console.error('[ParkDetail] Failed to publish arrival:', err);
    } finally {
      setPublishingSession(false);
    }
  }, [timeRangeMinutes, pickedDate, dayFilter, selectedPark]);

  return {
    showTimePicker,
    setShowTimePicker,
    timeRangeMinutes,
    setTimeRangeMinutes,
    pickedDate,
    setPickedDate,
    publishingSession,
    localArrivals,
    setLocalArrivals,
    handlePublishArrival,
  };
}

/** "הצטרף" on a park session — materializes a recurring group slot first. */
export function useJoinParkEvent() {
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);

  const handleJoinEvent = useCallback(async (ev: SessionEnrichment) => {
    const user = auth.currentUser;
    if (!user) return;
    setJoiningEventId(ev.eventId);
    try {
      if (ev.isRecurring && ev.groupId) {
        const dateStr = recurringEventDate(ev.eventId);
        const time = recurringEventTime(ev.nextStartTime);
        await materializeVirtualSession(
          ev.groupId, dateStr ?? new Date().toISOString().split('T')[0], time,
          user.uid, user.displayName ?? 'משתמש', user.photoURL ?? undefined,
        );
      } else {
        await joinEvent(ev.eventId, user.uid, user.displayName ?? 'משתמש', user.photoURL ?? undefined);
      }
    } catch (err) {
      console.error('[ParkDetailSheet] Join event failed:', err);
    } finally {
      setJoiningEventId(null);
    }
  }, []);

  return { joiningEventId, handleJoinEvent };
}

/** "דרג את המקום" — the inline star rating + optional comment. */
export function useParkRating(
  park: Park | null,
  profileId: string | undefined,
  setReviews: Dispatch<SetStateAction<UserContribution[]>>,
) {
  const [ratingOpen, setRatingOpen] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);

  const handleRatingSubmit = useCallback(async () => {
    if (!userRating || !park || !profileId) return;
    setSubmittingRating(true);
    try {
      await createContribution({
        userId: profileId,
        type: 'review',
        // Explicit auto-approval — no moderation step exists for reviews.
        status: 'approved',
        location: park.location ?? { lat: 0, lng: 0 },
        linkedParkId: park.id,
        rating: userRating,
        // Conditional spread, not `|| undefined` — a key PRESENT with value
        // undefined crashes addDoc() ("Unsupported field value: undefined");
        // it must be ABSENT entirely when there's no comment.
        ...(ratingComment.trim() ? { comment: ratingComment.trim() } : {}),
      });
      // Keep the park's denormalized rating current for surfaces (ParkPreview)
      // that read ratingAvg/reviewCount. Swallows its own failure internally.
      await recomputeAndSaveParkRating(park.id);
      // Refresh the live `reviews` so this sheet's own star display updates
      // immediately, without a close/reopen.
      getReviewsForPark(park.id).then(setReviews).catch(() => {});
      setRatingDone(true);
      setTimeout(() => { setRatingOpen(false); setRatingDone(false); setUserRating(0); setRatingComment(''); }, 1500);
    } catch (err) {
      console.error('[ParkDetailSheet] Rating submit failed:', err);
    } finally {
      setSubmittingRating(false);
    }
  }, [userRating, ratingComment, park, profileId, setReviews]);

  return {
    ratingOpen,
    setRatingOpen,
    userRating,
    setUserRating,
    ratingComment,
    setRatingComment,
    submittingRating,
    ratingDone,
    handleRatingSubmit,
  };
}
