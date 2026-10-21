'use client';

import { Loader2, UserPlus, Calendar, ChevronDown } from 'lucide-react';
import type { ScheduleSlot } from '@/types/community.types';
import { formatSessionDate } from '../utils/group-details-logic';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface NextSessionCardProps {
  v2: boolean;
  nextSessionData: { date: string; time: string };
  nextSlot: ScheduleSlot | null;
  categoryLabel: string;
  spotsLeft: number | null;
  isFull: boolean;
  effectivePrice: number | null | undefined;
  isJoined: boolean | undefined;
  bookingLoading: boolean;
  isBooked: boolean;
  isWaitlisted: boolean;
  onBook: () => void;
  hasMultipleSlots: boolean;
  scheduleOpen: boolean;
  onToggleSchedule: () => void;
}

/** "המפגש הבא" banner — spots left, personal goal, book/waitlist/cancel, full-schedule toggle. */
export default function NextSessionCard({
  v2,
  nextSessionData,
  nextSlot,
  categoryLabel,
  spotsLeft,
  isFull,
  effectivePrice,
  isJoined,
  bookingLoading,
  isBooked,
  isWaitlisted,
  onBook,
  hasMultipleSlots,
  scheduleOpen,
  onToggleSchedule,
}: NextSessionCardProps) {
  const t = useT(community);
  return (
    <div
      className={
        v2
          ? 'space-y-3 rounded-[20px] bg-v2-tint p-4'
          : 'bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20 rounded-2xl p-4 border border-cyan-100 dark:border-cyan-800/40 space-y-3'
      }
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className={v2 ? 'text-[13px] font-extrabold text-v2-deep' : 'text-xs font-bold text-cyan-600 uppercase tracking-widest'}>{t('group.next.title')}</p>
          <p className={v2 ? 'text-[17px] font-black leading-snug text-v2-ink' : 'text-sm font-black text-gray-900 dark:text-white leading-snug'}>
            {nextSlot?.label || categoryLabel} · {formatSessionDate(nextSessionData.date, nextSessionData.time, t)}
            {spotsLeft != null && (
              <span className={`mr-1.5 text-xs font-black ${isFull ? 'text-red-500' : 'text-cyan-600'}`}>
                {isFull ? t('group.next.full') : t('group.next.spotsLeft', { count: String(spotsLeft) })}
              </span>
            )}
          </p>
        </div>
        {effectivePrice != null && effectivePrice > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-black flex-shrink-0">
            ₪{effectivePrice}
          </span>
        )}
      </div>

      {nextSlot?.workoutGoal && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-cyan-200 text-[11px] font-bold text-cyan-700">
          {t('group.next.goal', {
            type: nextSlot.workoutGoal.type ?? '',
            value: nextSlot.workoutGoal.type === 'distance'
              ? nextSlot.workoutGoal.value.toFixed(1)
              : String(Math.round(nextSlot.workoutGoal.value / 60)),
          })}
        </span>
      )}

      {/* Book / Waitlist / Cancel button (only if joined) */}
      {isJoined && (
        <button
          disabled={bookingLoading}
          onClick={onBook}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all active:scale-[0.97] ${
            isBooked
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
              : isWaitlisted
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                : isFull
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                  : v2
                    ? 'bg-v2-cta text-v2-on-cta shadow-v2-cta !rounded-full !py-3.5 text-[15px]'
                    : 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25'
          }`}
        >
          {bookingLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isBooked ? (
            <>{t('group.next.booked')}</>
          ) : isWaitlisted ? (
            <>{t('group.next.waitlisted')}</>
          ) : isFull ? (
            <>{t('group.next.joinWaitlist')}</>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              {t('group.next.book')}
            </>
          )}
        </button>
      )}

      {/* "See full schedule" toggle */}
      {hasMultipleSlots && (
        <button
          type="button"
          onClick={onToggleSchedule}
          className="flex items-center gap-1 text-xs text-cyan-600 font-bold hover:text-cyan-700 transition-colors mx-auto"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>{scheduleOpen ? t('group.next.hideSchedule') : t('group.next.showSchedule')}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${scheduleOpen ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}
