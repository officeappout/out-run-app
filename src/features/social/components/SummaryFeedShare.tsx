'use client';

/**
 * SummaryFeedShare — the feed's "share your workout?" prompt, offered on the
 * workout summary too (home v2). Same sheets as /community (FeedShareSheet +
 * FeedPrivacySheet); the caller decides what "publish" means for its flow:
 *   - run/walk: the post decision already landed as a pending share → publish
 *     it now with createWorkoutPost(…, { manual: true }) (PendingSummaryFeedShare)
 *   - strength: the post is created at "סיום" → the choice rides along in the
 *     finish payload (SummaryShareDecision) and the card says "will publish".
 * Either way "לא הפעם" / a share clears the pending share, so the feed
 * doesn't ask again.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import {
  applyShareChoice,
  clearPendingShare,
  feedPrefsFrom,
  isPendingShareFor,
  PENDING_SHARE_EVENT,
  readPendingShare,
  saveFeedPrefs,
  type FeedPrefs,
  type ShareChoice,
} from '../services/feed-prefs';
import { createWorkoutPost } from '../services/feed.service';
import { FeedPrivacySheet, FeedShareSheet, SummaryShareCard, type ShareableWorkout } from './FeedPublishSheets';

export interface SummaryFeedShareProps {
  workout: ShareableWorkout;
  /**
   * 'published' = posted now; 'queued' = the finish handler will post it;
   * false = it failed (the sheet stays open so the user can retry).
   */
  onPublish: (choice: ShareChoice) => Promise<'published' | 'queued' | false>;
  onSkip: () => void;
}

export default function SummaryFeedShare({ workout, onPublish, onSkip }: SummaryFeedShareProps) {
  const profile = useUserStore((s) => s.profile);
  const refreshProfile = useUserStore((s) => s.refreshProfile);
  const feedPrefs: FeedPrefs = feedPrefsFrom((profile?.social as { feedPrefs?: unknown } | undefined)?.feedPrefs);
  const [status, setStatus] = useState<'ask' | 'published' | 'queued' | 'skipped'>('ask');
  const [shareOpen, setShareOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status === 'skipped') return null;

  const handlePublish = async (choice: ShareChoice) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await onPublish(choice);
      if (result) {
        setStatus(result);
        setShareOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = () => {
    onSkip();
    setStatus('skipped');
  };

  const handleSavePrefs = async (next: FeedPrefs) => {
    const uid = profile?.id;
    if (!uid) return;
    setBusy(true);
    try {
      await saveFeedPrefs(uid, next);
      await refreshProfile?.();
      setPrivacyOpen(false);
    } catch (err) {
      console.error('[SummaryFeedShare] saveFeedPrefs failed:', err);
    } finally {
      setBusy(false);
    }
  };

  // The sheets are fixed overlays; the summary lives inside a dragged
  // (transformed) drawer, which would trap `position: fixed` — portal them.
  const sheets = (
    <>
      <FeedShareSheet
        open={shareOpen}
        workout={workout}
        defaults={feedPrefs}
        busy={busy}
        onPublish={(c) => void handlePublish(c)}
        onSkip={() => {
          setShareOpen(false);
          handleSkip();
        }}
        onClose={() => setShareOpen(false)}
        onOpenPrivacy={() => {
          setShareOpen(false);
          setPrivacyOpen(true);
        }}
      />
      <FeedPrivacySheet
        open={privacyOpen}
        prefs={feedPrefs}
        busy={busy}
        onSave={(n) => void handleSavePrefs(n)}
        onClose={() => setPrivacyOpen(false)}
      />
    </>
  );

  return (
    <>
      <SummaryShareCard
        workout={workout}
        status={status}
        onShare={() => setShareOpen(true)}
        onDismiss={handleSkip}
      />
      {typeof document !== 'undefined' ? createPortal(sheets, document.body) : null}
    </>
  );
}

type PendingParams = Parameters<typeof createWorkoutPost>[0];

/**
 * Run/walk summary: finishWorkout already asked createWorkoutPost, which —
 * auto-publish off — saved the workout as a pending share a moment after this
 * screen opened. Offer exactly that one (never an older pending share), and
 * publish it with the same manual createWorkoutPost the feed prompt uses.
 */
export function PendingSummaryFeedShare({ activity }: { activity: PendingParams['activityCategory'] }) {
  const [openedAt] = useState(() => Date.now());
  const [pending, setPending] = useState<PendingParams | null>(null);

  useEffect(() => {
    const read = () => {
      const p = readPendingShare<PendingParams>();
      if (p && isPendingShareFor(p, openedAt) && p.params?.activityCategory === activity) setPending(p.params);
    };
    read();
    window.addEventListener(PENDING_SHARE_EVENT, read);
    return () => window.removeEventListener(PENDING_SHARE_EVENT, read);
  }, [openedAt, activity]);

  if (!pending) return null;

  return (
    <SummaryFeedShare
      workout={{
        activityCategory: pending.activityCategory,
        durationMinutes: pending.durationMinutes,
        distanceKm: pending.distanceKm,
        title: pending.title,
        parkName: pending.parkName,
        routeShape: pending.routeShape,
      }}
      onPublish={async (choice) => {
        const id = await createWorkoutPost(applyShareChoice(pending, choice), { manual: true });
        if (!id) return false;
        clearPendingShare();
        return 'published';
      }}
      onSkip={clearPendingShare}
    />
  );
}
