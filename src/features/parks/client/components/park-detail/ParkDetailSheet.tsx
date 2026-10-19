'use client';

/**
 * ParkDetailSheet — the park page bottom sheet.
 *
 * This file only composes: data access lives in ./hooks (point-fetch,
 * sessions, reviews, equipment, actions), pure logic in ./utils (tested), and
 * every block of the page is a render-only section in ./sections. The order
 * of the hook calls below is load-bearing — it is the order the effects ran
 * in when this was a single file (scroll chain → point-fetch → tripwire →
 * park events → registrations → reviews → reviewer names → equipment → body
 * scroll lock → scroll sync); keep it.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import HeroSheetFrame from '@/components/ui/HeroSheetFrame';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { useUserStore } from '@/features/user';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { haversineKm, distanceLabel } from '@/features/arena/utils/distance';
import type { DayFilter } from '@/features/parks/core/hooks/useCommunityEnrichment';
import SuggestEditSheet from '../contribution-wizard/SuggestEditSheet';
import UserProfileSheet, { type ProfileUser } from '../UserProfileSheet';
import EquipmentDetailDrawer from '../equipment-detail/EquipmentDetailDrawer';
import { DRAWER_HEIGHT, START_WORKOUT_CTA_LINES, REVIEWS_COLLAPSED_COUNT } from './utils/park-detail-format';
import { averageReviewRating, buildParkPhotoGallery } from './utils/park-detail-logic';
import { useParkSheetMotion, useParkScrollProgressSync } from './hooks/useParkSheetMotion';
import { usePointFetchedPark, useParkReviews, useParkEquipment } from './hooks/useParkDetailData';
import { useParkSessions } from './hooks/useParkSessions';
import { useParkArrivalPublish, useJoinParkEvent, useParkRating } from './hooks/useParkActions';
import ParkStickyHeader from './sections/ParkStickyHeader';
import ParkHero from './sections/ParkHero';
import ParkMetaRow from './sections/ParkMetaRow';
import ParkPulseSection from './sections/ParkPulseSection';
import ArrivalPublishPanel from './sections/ArrivalPublishPanel';
import ParkAmenitiesSection from './sections/ParkAmenitiesSection';
import ParkEquipmentSection from './sections/ParkEquipmentSection';
import ParkPhotosSection from './sections/ParkPhotosSection';
import ParkRatingSection from './sections/ParkRatingSection';
import ParkReviewsSection from './sections/ParkReviewsSection';
import ParkActionBar from './sections/ParkActionBar';
import ParkPhotoLightbox from './sections/ParkPhotoLightbox';

interface ParkDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onStartWorkout?: () => void;
  userLocation?: { lat: number; lng: number } | null;
}

export default function ParkDetailSheet({ isOpen, onClose, onStartWorkout, userLocation }: ParkDetailSheetProps) {
  const { selectedPark } = useMapStore();
  const { profile } = useUserStore();
  // Home v2 (enable_home_v2): the design-lab park page.
  const v2 = useFeatureFlags(!!(profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin).flags.enableHomeV2;
  const motion = useParkSheetMotion(isOpen, onClose);

  const [suggestEditOpen, setSuggestEditOpen] = useState(false);
  // Pick one CTA line per sheet mount — see START_WORKOUT_CTA_LINES.
  const startWorkoutCta = useMemo(
    () => START_WORKOUT_CTA_LINES[Math.floor(Math.random() * START_WORKOUT_CTA_LINES.length)],
    [],
  );
  // Gallery expanded image
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<DayFilter>('today');
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  // Equipment-detail drawer: `{ id, brand }` keeps the brand context the park
  // advertised; `null` keeps the drawer closed.
  const [selectedEquipment, setSelectedEquipment] = useState<
    { id: string; brand: string | null } | null
  >(null);

  const arrival = useParkArrivalPublish(selectedPark, dayFilter);
  const park = usePointFetchedPark(isOpen, selectedPark);

  const myGroupIds = profile?.social?.groupIds ?? [];
  const { parkEvents, eventsLoading, filteredParkEvents, currentUid, isUserRegistered } = useParkSessions({
    isOpen,
    park,
    myGroupIds,
    dayFilter,
    localArrivals: arrival.localArrivals,
  });
  const { joiningEventId, handleJoinEvent } = useJoinParkEvent();

  const { reviews, setReviews, reviewerNames, reviewsExpanded, setReviewsExpanded } = useParkReviews(isOpen, park?.id);
  const { parkEquipment, equipmentSections } = useParkEquipment(isOpen, park);
  const rating = useParkRating(park, profile?.id, setReviews);

  const avgRating = useMemo(() => averageReviewRating(reviews, park?.rating), [reviews, park?.rating]);
  const ratedReviews = useMemo(() => reviews.filter(r => r.rating), [reviews]);
  const visibleReviews = reviewsExpanded ? ratedReviews : ratedReviews.slice(0, REVIEWS_COLLAPSED_COUNT);

  const distText = useMemo(() => {
    if (!userLocation || !park?.location) return null;
    const km = haversineKm(userLocation.lat, userLocation.lng, park.location.lat, park.location.lng);
    return distanceLabel(km);
  }, [userLocation, park?.location]);

  const photoGallery = useMemo(() => buildParkPhotoGallery(park, reviews), [park, reviews]);

  // Prevent body scroll; drop optimistic arrivals on close.
  const { setLocalArrivals } = arrival;
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else {
      document.body.style.overflow = '';
      setLocalArrivals([]);
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useParkScrollProgressSync(motion.scrollRef, isOpen, motion.scrollYMV);

  const handleNavigate = useCallback(() => {
    if (!park?.location) return;
    const { lat, lng } = park.location;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
  }, [park?.location]);

  if (!park) return null;

  return (
    <>
      <HeroSheetFrame
        isOpen={isOpen}
        onClose={onClose}
        v2={v2}
        y={motion.y}
        opacity={motion.opacity}
        dragControls={motion.dragControls}
        onDragEnd={motion.handleDragEnd}
        frameStyle={{ height: DRAWER_HEIGHT, maxHeight: '92vh', willChange: 'transform' }}
        classicClassName="kb-sheet fixed bottom-0 left-0 right-0 z-[100] bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl overflow-hidden"
        keyboardAware
        ariaLabel={park.name}
      >
        <ParkStickyHeader
          name={park.name}
          onClose={onClose}
          headerOpacity={motion.headerOpacity}
          headerPointerEvents={motion.headerPointerEvents}
        />

        {/* Scrollable body */}
        <div ref={motion.scrollRef} className="h-full overflow-y-auto overscroll-contain pb-36">
          <ParkHero
            park={park}
            v2={v2}
            onClose={onClose}
            heroHeight={motion.heroHeight}
            imageOpacity={motion.imageOpacity}
            imageScale={motion.imageScale}
            heroControlsPointerEvents={motion.heroControlsPointerEvents}
          />

          {/* Content — the title block's own `-mt-14` bridges the hero gradient. */}
          <div className="bg-white dark:bg-slate-900 relative z-10 px-5 pt-2 pb-8">
            <ParkMetaRow park={park} v2={v2} avgRating={avgRating} ratedCount={ratedReviews.length} distText={distText} />

            <ParkPulseSection
              v2={v2}
              parkEvents={parkEvents}
              sessions={filteredParkEvents}
              loading={eventsLoading}
              dayFilter={dayFilter}
              onDayFilterChange={setDayFilter}
              currentUid={currentUid}
              joiningEventId={joiningEventId}
              isUserRegistered={isUserRegistered}
              onJoin={handleJoinEvent}
              onOpenProfile={setProfileUser}
              publishPanel={
                <ArrivalPublishPanel
                  v2={v2}
                  hasSessions={filteredParkEvents.length > 0}
                  dayFilter={dayFilter}
                  showTimePicker={arrival.showTimePicker}
                  onToggleTimePicker={() => arrival.setShowTimePicker((v) => !v)}
                  pickedDate={arrival.pickedDate}
                  onPickDate={arrival.setPickedDate}
                  timeRangeMinutes={arrival.timeRangeMinutes}
                  onTimeRangeChange={arrival.setTimeRangeMinutes}
                  publishing={arrival.publishingSession}
                  onPublish={arrival.handlePublishArrival}
                />
              }
            />

            <ParkAmenitiesSection park={park} v2={v2} />

            {/* DESCRIPTION — free-text paragraph */}
            {park.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
                {park.description}
              </p>
            )}

            {parkEquipment.length > 0 && (
              <ParkEquipmentSection park={park} v2={v2} sections={equipmentSections} onSelect={setSelectedEquipment} />
            )}

            {photoGallery.length > 1 && (
              <ParkPhotosSection v2={v2} photos={photoGallery} onOpenPhoto={setExpandedPhoto} />
            )}

            <ParkRatingSection
              open={rating.ratingOpen}
              onToggle={() => rating.setRatingOpen(!rating.ratingOpen)}
              done={rating.ratingDone}
              rating={rating.userRating}
              onRatingChange={rating.setUserRating}
              comment={rating.ratingComment}
              onCommentChange={rating.setRatingComment}
              submitting={rating.submittingRating}
              onSubmit={rating.handleRatingSubmit}
            />

            {ratedReviews.length > 0 && (
              <ParkReviewsSection
                v2={v2}
                ratedReviews={ratedReviews}
                visibleReviews={visibleReviews}
                reviewerNames={reviewerNames}
                expanded={reviewsExpanded}
                onExpand={() => setReviewsExpanded(true)}
              />
            )}
          </div>
        </div>

        <ParkActionBar
          v2={v2}
          ctaLabel={startWorkoutCta}
          onStartWorkout={() => { onClose(); onStartWorkout?.(); }}
          onSuggestEdit={() => setSuggestEditOpen(true)}
          onNavigate={handleNavigate}
        />
      </HeroSheetFrame>

      {/* Suggest Edit sheet */}
      {suggestEditOpen && park && (
        <SuggestEditSheet
          isOpen={suggestEditOpen}
          onClose={() => setSuggestEditOpen(false)}
          park={park as any} // eslint-disable-line @typescript-eslint/no-explicit-any
        />
      )}

      <ParkPhotoLightbox url={expandedPhoto} onClose={() => setExpandedPhoto(null)} />

      {/* User Profile Sheet */}
      <UserProfileSheet
        isOpen={!!profileUser}
        onClose={() => setProfileUser(null)}
        user={profileUser}
      />

      {/* Equipment-detail drawer — opens above the park sheet (z-[200]) when
          an equipment card is tapped. Stays mounted with `isOpen` driven by
          local state so the slide-out animation can play on close. */}
      <EquipmentDetailDrawer
        isOpen={!!selectedEquipment}
        onClose={() => setSelectedEquipment(null)}
        equipmentId={selectedEquipment?.id ?? null}
        brandName={selectedEquipment?.brand ?? null}
        pinnedToPark
      />
    </>
  );
}
