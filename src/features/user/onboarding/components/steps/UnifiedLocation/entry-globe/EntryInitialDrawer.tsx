'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { EntryDrawer, EntryCta, EntryLink } from './EntryDrawer';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';

/** INITIAL — over the live Earth: ask for location (GPS on tap only) or search. */
export function EntryInitialDrawer({
  locationError,
  onFindLocation,
  onSearchManually,
}: {
  locationError: string | null;
  onFindLocation: () => void;
  onSearchManually: () => void;
}) {
  const t = useT(onboarding);
  return (
    <EntryDrawer delay={locationError ? 0 : 1.1}>
      <h2 className="text-center text-[22px] font-black !tracking-[-0.02em] text-v2-ink">
        {t('location.entry.initial.title')}
      </h2>
      <p className="text-center text-[14.5px] leading-[21px] text-v2-ink-2">{t('location.entry.initial.body')}</p>

      {locationError && (
        <div className="rounded-2xl bg-[#b4232a]/[0.06] px-3.5 py-2.5" role="alert">
          <p className="text-right text-[12.5px] font-bold text-[#b4232a]">{locationError}</p>
        </div>
      )}

      <EntryCta onClick={onFindLocation}>
        <Search size={19} strokeWidth={2.6} className="flex-shrink-0" aria-hidden />
        <span className="truncate">{t('location.entry.initial.cta')}</span>
      </EntryCta>
      <EntryLink onClick={onSearchManually}>{t('location.entry.initial.manual')}</EntryLink>
    </EntryDrawer>
  );
}
