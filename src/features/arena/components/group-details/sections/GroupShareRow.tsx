'use client';

import { Share2, CalendarPlus } from 'lucide-react';
import { APP_ORIGIN_FALLBACK, groupShareLink } from '../utils/group-details-logic';

interface GroupShareRowProps {
  groupId: string;
  groupName: string;
  categoryLabel: string;
  inviteCode: string | null;
  calendarUrl: string | null;
}

/**
 * Secondary actions row — icon + word, not full-width stacked buttons
 * (07.09.2026: the old stack of full-width CTAs ate half the screen). Share
 * is always visible; add-to-calendar only when a next session exists.
 */
export default function GroupShareRow({ groupId, groupName, categoryLabel, inviteCode, calendarUrl }: GroupShareRowProps) {
  const origin = typeof window !== 'undefined' ? window.location.origin : APP_ORIGIN_FALLBACK;
  const deepLink = groupShareLink(origin, groupId, inviteCode);
  const shareText = `מצאתי קבוצת ${categoryLabel} מעולה: \'${groupName}\'! בואו להצטרף אלינו.`;
  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: groupName, text: shareText, url: deepLink }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${deepLink}`)}`, '_blank');
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleShare}
        aria-label="שתף קבוצה"
        className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 transition-all active:scale-[0.97]"
      >
        <Share2 className="w-4 h-4" />
        שתף
      </button>

      {calendarUrl && (
        <a
          href={calendarUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 transition-all active:scale-[0.97]"
        >
          <CalendarPlus className="w-4 h-4" />
          ליומן
        </a>
      )}
    </div>
  );
}
