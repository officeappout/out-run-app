'use client';

import { Star, Loader2 } from 'lucide-react';
import { XP_REWARDS } from '@/types/contribution.types';
import StarRatingWidget from '../../contribution-wizard/StarRatingWidget';
import { useT } from '@/hooks/useT';
import { map as mapNs } from '@/messages/ns/map';

interface ParkRatingSectionProps {
  open: boolean;
  onToggle: () => void;
  done: boolean;
  rating: number;
  onRatingChange: (rating: number) => void;
  comment: string;
  onCommentChange: (comment: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}

/** "דרג את המקום" — inline stars + optional comment. */
export default function ParkRatingSection({
  open,
  onToggle,
  done,
  rating,
  onRatingChange,
  comment,
  onCommentChange,
  submitting,
  onSubmit,
}: ParkRatingSectionProps) {
  const t = useT(mapNs);
  return (
    <section className="mb-6">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-center gap-2 py-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 text-sm font-bold active:scale-[0.98] transition-transform"
      >
        <Star size={16} />
        {t('parkDetail.rating.cta')}
      </button>
      {open && (
        <div className="mt-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4">
          {done ? (
            <div className="flex items-center justify-center gap-2 py-2">
              <span className="text-emerald-500 text-sm font-bold">{t('parkDetail.rating.thanks', { xp: String(XP_REWARDS.review) })}</span>
            </div>
          ) : (
            <>
              <StarRatingWidget value={rating} onChange={onRatingChange} size={28} />
              {rating > 0 && (
                <div className="mt-3 flex gap-2 items-end">
                  <input
                    type="text"
                    value={comment}
                    onChange={e => onCommentChange(e.target.value)}
                    placeholder={t('parkDetail.rating.placeholder')}
                    className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm text-gray-700 dark:text-gray-200 placeholder:text-gray-400 outline-none"
                  />
                  <button
                    onClick={onSubmit}
                    disabled={submitting}
                    className="px-5 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : t('parkDetail.rating.send')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
