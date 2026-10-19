'use client';

import { Star } from 'lucide-react';
import type { UserContribution } from '@/types/contribution.types';
import { formatDate, REVIEWS_COLLAPSED_COUNT } from '../utils/park-detail-format';
import { sectionTitleClass } from './section-styles';

interface ParkReviewsSectionProps {
  v2: boolean;
  ratedReviews: UserContribution[];
  visibleReviews: UserContribution[];
  reviewerNames: Record<string, string>;
  expanded: boolean;
  onExpand: () => void;
}

/**
 * Reviews list — Google-style: no card fill/box, a thin divider between
 * entries. Collapsed to REVIEWS_COLLAPSED_COUNT; "צפה בעוד ביקורות" reveals
 * the rest (already fetched, no further read). The name always comes from
 * reviewerNames (userPublic lookup, 'משתמש' fallback) — never the raw uid.
 */
export default function ParkReviewsSection({ v2, ratedReviews, visibleReviews, reviewerNames, expanded, onExpand }: ParkReviewsSectionProps) {
  return (
    <section className="mb-4">
      <h3 className={sectionTitleClass(v2)}>ביקורות</h3>
      <div className="divide-y divide-gray-100 dark:divide-slate-800">
        {visibleReviews.map(review => {
          const reviewerName = (review.userId && reviewerNames[review.userId]) || 'משתמש';
          return (
            <div key={review.id} className="py-3.5 first:pt-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                  <span className="text-[11px] text-white font-black">{reviewerName.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-gray-800 dark:text-gray-200 truncate">{reviewerName}</p>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} size={11} className={s <= (review.rating ?? 0) ? 'text-amber-400' : 'text-gray-200 dark:text-gray-600'} fill={s <= (review.rating ?? 0) ? '#FBBF24' : 'none'} />
                      ))}
                    </div>
                    <span className="text-[10px] text-gray-400">{formatDate(review.createdAt)}</span>
                  </div>
                </div>
              </div>
              {review.comment && <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mt-1.5 pr-10">{review.comment}</p>}
            </div>
          );
        })}
      </div>
      {!expanded && ratedReviews.length > REVIEWS_COLLAPSED_COUNT && (
        <button
          onClick={onExpand}
          className="mt-2 text-xs font-bold text-cyan-600 dark:text-cyan-400 active:opacity-70 transition-opacity"
        >
          צפה בעוד ביקורות ({ratedReviews.length - REVIEWS_COLLAPSED_COUNT})
        </button>
      )}
    </section>
  );
}
