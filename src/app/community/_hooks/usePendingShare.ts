import { useEffect, useState } from 'react';
import type { createWorkoutPost } from '@/features/social/services/feed.service';
import { readPendingShare } from '@/features/social/services/feed-prefs';

export type PendingParams = Parameters<typeof createWorkoutPost>[0];

/** Opt-in publishing (feed-prefs.ts): the last unshared workout + the sheets. */
export function usePendingShare() {
  const [pendingShare, setPendingShare] = useState<PendingParams | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  useEffect(() => {
    setPendingShare(readPendingShare<PendingParams>()?.params ?? null);
  }, []);
  return {
    pendingShare,
    setPendingShare,
    shareOpen,
    setShareOpen,
    privacyOpen,
    setPrivacyOpen,
    publishBusy,
    setPublishBusy,
  };
}

export type PendingShareState = ReturnType<typeof usePendingShare>;
