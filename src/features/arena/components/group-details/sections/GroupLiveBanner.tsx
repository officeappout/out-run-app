'use client';

import type { UpcomingSession } from '@/features/arena/hooks/useCommunitySessionBanner';
import CommunitySessionBanner from '@/features/arena/components/CommunitySessionBanner';
import type { LiveSessionPhase } from '@/types/community.types';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface GroupLiveBannerProps {
  session: UpcomingSession;
  isJoined: boolean | undefined;
  canDropIn: boolean;
  isCityOnly: boolean | undefined;
  destAddress: string | undefined;
  onClose: () => void;
  onDropIn: () => void;
  onLivePhaseChange?: (groupId: string, phase: LiveSessionPhase | null) => void;
}

/**
 * Live session banner (approaching / lobby / active — the caller gates the
 * phase). Members always see it (private group members included); non-members
 * only when they can drop in (public, unlocked, city-match) — otherwise a
 * muted "active · members/residents only" line.
 */
export default function GroupLiveBanner({ session, isJoined, canDropIn, isCityOnly, destAddress, onClose, onDropIn, onLivePhaseChange }: GroupLiveBannerProps) {
  const t = useT(community);
  return isJoined ? (
    <CommunitySessionBanner
      session={session}
      onDismiss={onClose}
      compact
      isJoined
      onDevPhaseChange={(phase) => onLivePhaseChange?.(session.groupId, phase)}
    />
  ) : canDropIn ? (
    <CommunitySessionBanner
      session={session}
      onDismiss={onClose}
      compact
      isJoined={false}
      onDropIn={onDropIn}
      onDevPhaseChange={(phase) => onLivePhaseChange?.(session.groupId, phase)}
    />
  ) : (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-bold" dir="rtl">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
      <span>
        {isCityOnly
          ? destAddress != null
            ? t('group.live.cityOnly', { city: destAddress.split(',')[0] })
            : t('group.live.cityOnlyNoAddress')
          : t('group.live.membersOnly')}
      </span>
    </div>
  );
}
