'use client';

import React from 'react';
import { MapPin } from 'lucide-react';
import IconTile from '@/components/ui/v2/IconTile';
import Button from '@/components/ui/v2/Button';
import type { LeaguesVM } from './leagues-vm';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

// 17.08.2026: friendly empty state for users with no core.neighborhoodId —
// replaces the contribution card + battle card (which need "you" resolved
// in the neighborhood ranking and would otherwise just silently vanish,
// same "not broken, just missing an anchor" issue the battle-card empty
// state already addresses). The scope-vs-scope podium/list below this
// still renders regardless — it isn't personal, so it's not gated on
// having a neighborhood set.
export function NeighborhoodSetupCTA({ vm }: { vm: LeaguesVM }) {
  const {
    router,
  } = vm;
  const t = useT(community);
  return (
    <div className="rounded-v2-card bg-white shadow-v2-card p-5 mb-3 text-center flex flex-col items-center" dir="rtl">
      <IconTile icon={MapPin} tone="accent" size="lg" />
      <p className="text-[16px] font-black text-v2-ink mt-3">{t('communityPage.setup.title')}</p>
      <p className="text-[13px] text-v2-muted mt-1">{t('communityPage.setup.body')}</p>
      <Button variant="primary" size="sm" className="mt-3.5" onClick={() => router.push('/profile')}>
        {t('communityPage.setup.cta')}
      </Button>
    </div>
  );
}
