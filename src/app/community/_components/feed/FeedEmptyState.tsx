'use client';

import React from 'react';
import { Users, UserPlus } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

/** "Your feed is empty" (+ a find-partners CTA in Home v2). */
export function FeedEmptyState({ v2, onFindPartners }: { v2: boolean; onFindPartners: () => void }) {
  const t = useT(community);
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4" dir="rtl">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Users className="w-7 h-7 text-gray-400" />
      </div>
      <p className="text-sm font-bold text-gray-900">{t('communityPage.feed.empty.title')}</p>
      <p className="text-xs text-gray-600 mt-1 max-w-[240px]">
        {t('communityPage.feed.empty.body')}
      </p>
      {v2 && (
        <button
          type="button"
          onClick={onFindPartners}
          className="mt-4 flex h-11 items-center gap-1.5 rounded-full bg-v2-cta px-5 text-[14.5px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <UserPlus size={17} strokeWidth={2.6} aria-hidden />
          {t('communityPage.feed.empty.findPartners')}
        </button>
      )}
    </div>
  );
}
