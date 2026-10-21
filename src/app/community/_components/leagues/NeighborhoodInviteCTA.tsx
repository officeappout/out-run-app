'use client';

import React from 'react';
import { Users } from 'lucide-react';
import Button from '@/components/ui/v2/Button';
import type { LeaguesVM } from './leagues-vm';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

// Neighborhood-axis-only invite CTA (mockup Screen 3, Frame A). Uses the
// real neighborhood name from activeScopeEntry (already bubbled by
// ScopeBattleCard) — no new fetch. Same native-share/clipboard mechanism
// as the other invite buttons on this page. Copy is deliberately metric-
// agnostic ("יותר פעילות") rather than the mockup's "יותר צעדים" — the
// selected metric might not be steps, and claiming it always is would be
// dishonest given getScopeCompetitionLeaderboard still sums activityCredit,
// not a literal step count.
export function NeighborhoodInviteCTA({ vm }: { vm: LeaguesVM }) {
  const {
    activeScopeEntry,
  } = vm;
  const t = useT(community);
  if (!activeScopeEntry) return null;
  const handleInviteNeighbors = () => {
    const text = t('communityPage.invite.shareText', { scope: activeScopeEntry.scopeName });
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text);
  };
  return (
    // 17.10.2026 (design lab #321): the invite card on the light battle
    // gradient with one primary button — not a second full-gradient card.
    <div
      className="w-full rounded-v2-card border border-v2-hairline-cool bg-gradient-to-br from-[#e8f9fe] to-[#e9fdfb] p-4 text-right"
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div className="w-[42px] h-[42px] rounded-[14px] flex items-center justify-center flex-shrink-0 bg-white text-v2-deep">
          <Users className="w-5 h-5" strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <p className="text-[16px] font-black text-v2-ink">{t('communityPage.invite.title', { scope: activeScopeEntry.scopeName })}</p>
          <p className="text-[13.5px] text-v2-ink-2 leading-snug mt-0.5">{t('communityPage.invite.body')}</p>
        </div>
      </div>
      <Button variant="primary" size="md" block className="mt-3" onClick={handleInviteNeighbors}>
        {t('communityPage.invite.cta')}
      </Button>
    </div>
  );
}
