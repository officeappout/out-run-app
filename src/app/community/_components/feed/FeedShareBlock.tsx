'use client';

import React from 'react';
import { createWorkoutPost } from '@/features/social/services/feed.service';
import {
  applyShareChoice,
  clearPendingShare,
  saveFeedPrefs,
  type FeedPrefs,
  type ShareChoice,
} from '@/features/social/services/feed-prefs';
import { FeedPrivacySheet, FeedShareSheet, SharePromptCard, type ShareableWorkout } from '@/features/social/components/FeedPublishSheets';
import type { PendingShareState } from '../../_hooks/usePendingShare';

/**
 * Home v2: the "share your last workout" prompt and the opt-in publish /
 * feed-privacy sheets (feed-prefs.ts).
 */
export function FeedShareBlock({
  share,
  shareable,
  feedPrefs,
  userId,
  refreshProfile,
  fetchPosts,
}: {
  share: PendingShareState;
  shareable: ShareableWorkout | null;
  feedPrefs: FeedPrefs;
  userId: string | undefined;
  refreshProfile: (() => Promise<unknown>) | undefined;
  fetchPosts: () => Promise<void>;
}) {
  const {
    pendingShare,
    setPendingShare,
    shareOpen,
    setShareOpen,
    privacyOpen,
    setPrivacyOpen,
    publishBusy,
    setPublishBusy,
  } = share;

  async function handlePublishPending(choice: ShareChoice) {
    if (!pendingShare || publishBusy) return;
    setPublishBusy(true);
    const params = applyShareChoice(pendingShare, choice);
    const id = await createWorkoutPost(params, { manual: true, photo: choice.photo ?? null });
    setPublishBusy(false);
    if (id) {
      clearPendingShare();
      setPendingShare(null);
      setShareOpen(false);
      void fetchPosts();
    }
  }

  async function handleSavePrefs(next: FeedPrefs) {
    if (!userId) return;
    setPublishBusy(true);
    try {
      await saveFeedPrefs(userId, next);
      await refreshProfile?.();
      setPrivacyOpen(false);
    } catch (err) {
      console.error('[CommunityPage] saveFeedPrefs failed:', err);
    } finally {
      setPublishBusy(false);
    }
  }

  return (
    <div className="space-y-3 px-4" dir="rtl">
      {shareable && <SharePromptCard workout={shareable} onShare={() => setShareOpen(true)} />}
      <FeedShareSheet
        open={shareOpen}
        workout={shareable}
        defaults={feedPrefs}
        busy={publishBusy}
        onPublish={(c) => void handlePublishPending(c)}
        onSkip={() => {
          clearPendingShare();
          setPendingShare(null);
          setShareOpen(false);
        }}
        onClose={() => setShareOpen(false)}
        onOpenPrivacy={() => {
          setShareOpen(false);
          setPrivacyOpen(true);
        }}
        allowPhoto
      />
      <FeedPrivacySheet
        open={privacyOpen}
        prefs={feedPrefs}
        busy={publishBusy}
        onSave={(n) => void handleSavePrefs(n)}
        onClose={() => setPrivacyOpen(false)}
      />
    </div>
  );
}
