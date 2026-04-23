import React, { useState, useCallback, useMemo } from 'react';
import { Pencil, Star, Loader2, ChevronUp } from 'lucide-react';
import { useMapStore } from '../../../core/store/useMapStore';
import { useShelterProximity } from '../../../core/hooks/useShelterProximity';
import { formatShelterTagLabel } from '../../../core/services/shelter-proximity.service';
import SuggestEditSheet from '../contribution-wizard/SuggestEditSheet';
import StarRatingWidget from '../contribution-wizard/StarRatingWidget';
import ParkDetailSheet from '../park-detail/ParkDetailSheet';
import { createContribution } from '../../../core/services/contribution.service';
import { useUserStore } from '@/features/user';
import { XP_REWARDS } from '@/types/contribution.types';
import { haversineKm, distanceLabel } from '@/features/arena/utils/distance';

interface ParkPreviewProps {
  userLocation: { lat: number; lng: number } | null;
}

export const ParkPreview = ({ userLocation }: ParkPreviewProps) => {
  const { selectedPark, setSelectedPark } = useMapStore();
  const { profile } = useUserStore();
  const shelterDecision = useShelterProximity({ park: selectedPark as any });
  const [suggestEditOpen, setSuggestEditOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const distText = useMemo(() => {
    if (!userLocation || !selectedPark?.location) return null;
    const km = haversineKm(userLocation.lat, userLocation.lng, selectedPark.location.lat, selectedPark.location.lng);
    return distanceLabel(km);
  }, [userLocation, selectedPark?.location]);

  const handleRatingSubmit = useCallback(async () => {
    if (!userRating || !selectedPark || !profile?.id) return;
    setSubmittingRating(true);
    try {
      await createContribution({
        userId: profile.id,
        type: 'review',
        status: 'pending',
        location: selectedPark.location ?? { lat: 0, lng: 0 },
        linkedParkId: selectedPark.id,
        rating: userRating,
        comment: ratingComment.trim() || undefined,
      });
      setRatingDone(true);
      setTimeout(() => {
        setRatingOpen(false);
        setRatingDone(false);
        setUserRating(0);
        setRatingComment('');
      }, 1500);
    } catch (err) {
      console.error('[ParkPreview] Rating submit failed:', err);
    } finally {
      setSubmittingRating(false);
    }
  }, [userRating, ratingComment, selectedPark, profile?.id]);

  if (!selectedPark) return null;

  return (
    <>
      <div className="absolute bottom-[100px] left-4 right-4 z-30 animate-in slide-in-from-bottom-10 fade-in duration-500">
        <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-gray-100 dark:border-zinc-700">
          <div className="flex flex-row-reverse h-32">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPark(null);
              }}
              className="absolute top-2 left-2 z-10 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 backdrop-blur-sm transition-colors"
            >
              <span className="material-icons-round text-[10px] leading-none">close</span>
            </button>

            <div className="w-[35%] relative">
              {(selectedPark.image || selectedPark.images?.[0] || selectedPark.imageUrl) ? (
                <img 
                  alt={selectedPark.name} 
                  className="absolute inset-0 w-full h-full object-cover" 
                  src={selectedPark.image || selectedPark.images?.[0] || selectedPark.imageUrl || ''}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
                  <span className="material-icons-round text-slate-300 dark:text-slate-600 text-3xl">park</span>
                </div>
              )}
            </div>

            <div className="flex-1 p-4 flex flex-col justify-between text-right">
              <div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white leading-tight mb-0.5">
                  {selectedPark.name}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-xs">{selectedPark.city}</p>
              </div>

              <div className="flex items-center justify-between mt-auto">
                {distText && (
                  <div className="flex items-center bg-gray-100 dark:bg-zinc-700 px-2 py-1 rounded-md">
                    <span className="material-icons-round text-gray-500 dark:text-gray-300 text-[10px] ml-1">near_me</span>
                    <span className="text-[10px] font-medium text-gray-700 dark:text-gray-200">
                      {distText}
                    </span>
                  </div>
                )}

                <div className="flex items-center space-x-1 space-x-reverse">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {selectedPark.rating || '4.8'}
                  </span>
                  <span className="material-icons-round text-amber-400 text-sm">star</span>
                  <span className="text-[10px] text-gray-400">(120)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Shelter proximity tag */}
          {shelterDecision.show && shelterDecision.proximity && (
            <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 border-t border-emerald-100 dark:border-emerald-800">
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {formatShelterTagLabel(shelterDecision.proximity.walkingTimeMinutes)}
              </span>
            </div>
          )}

          {/* Expand to full detail + actions */}
          <div className="flex border-t border-gray-100 dark:border-zinc-700">
            <button
              onClick={() => setDetailOpen(true)}
              className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-gray-700 dark:text-gray-300 text-xs font-bold active:bg-gray-50 dark:active:bg-zinc-700 transition-colors"
            >
              <ChevronUp size={14} />
              פרטים מלאים
            </button>
            <div className="w-px bg-gray-100 dark:bg-zinc-700" />
            <button
              onClick={() => setSuggestEditOpen(true)}
              className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-cyan-500 text-xs font-bold active:bg-gray-50 dark:active:bg-zinc-700 transition-colors"
            >
              <Pencil size={13} />
              עדכן פרטים
            </button>
            <div className="w-px bg-gray-100 dark:bg-zinc-700" />
            <button
              onClick={() => setRatingOpen(!ratingOpen)}
              className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-amber-500 text-xs font-bold active:bg-gray-50 dark:active:bg-zinc-700 transition-colors"
            >
              <Star size={13} />
              דרג מקום
            </button>
          </div>

          {/* Inline rating widget */}
          {ratingOpen && (
            <div className="px-4 py-3 bg-gray-50 dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-700" dir="rtl">
              {ratingDone ? (
                <div className="flex items-center justify-center gap-2 py-2">
                  <span className="text-emerald-500 text-sm font-bold">תודה! +{XP_REWARDS.review} XP</span>
                </div>
              ) : (
                <>
                  <StarRatingWidget value={userRating} onChange={setUserRating} size={24} />
                  {userRating > 0 && (
                    <div className="mt-2 flex gap-2 items-end">
                      <input
                        type="text"
                        value={ratingComment}
                        onChange={(e) => setRatingComment(e.target.value)}
                        placeholder="תגובה (לא חובה)..."
                        className="flex-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-200 placeholder:text-gray-400 outline-none"
                      />
                      <button
                        onClick={handleRatingSubmit}
                        disabled={submittingRating}
                        className="px-4 py-2 rounded-lg bg-amber-500 text-white text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
                      >
                        {submittingRating ? <Loader2 size={14} className="animate-spin" /> : 'שלח'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full Park Detail Bottom Sheet */}
      <ParkDetailSheet
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        userLocation={userLocation}
      />

      {/* Suggest Edit bottom sheet */}
      {suggestEditOpen && selectedPark && (
        <SuggestEditSheet
          isOpen={suggestEditOpen}
          onClose={() => setSuggestEditOpen(false)}
          park={selectedPark as any}
        />
      )}
    </>
  );
};
