'use client';

import React from 'react';
import { Lock, UserPlus } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import { FEED_FILTERS, type FeedFilter } from '../../_lib/community-constants';

/** Home v2 feed chips: who-sees-my-posts, find partners, and the feed filter. */
export function FeedFilterBar({
  feedFilter,
  setFeedFilter,
  setPrivacyOpen,
  onFindPartners,
}: {
  feedFilter: FeedFilter;
  setFeedFilter: (f: FeedFilter) => void;
  setPrivacyOpen: (open: boolean) => void;
  onFindPartners: () => void;
}) {
  const t = useT(community);
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label={t('communityPage.feed.filterBar.label')} dir="rtl">
      <button
        type="button"
        onClick={() => setPrivacyOpen(true)}
        aria-label={t('communityPage.feed.filterBar.privacy')}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <Lock size={15} strokeWidth={2.6} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onFindPartners}
        className="flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-v2-tint px-3.5 text-[13.5px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <UserPlus size={15} strokeWidth={2.6} aria-hidden />
        {t('communityPage.feed.filterBar.partners')}
      </button>
      {FEED_FILTERS.map((f) => {
        const on = f.id === feedFilter;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setFeedFilter(f.id)}
            className={`h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[13.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
              on ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
            }`}
          >
            {t(f.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
