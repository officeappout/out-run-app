'use client';

/**
 * The post-workout push re-ask (enable_home_v2 — gates itself, so a mount
 * point is one line and flag-off renders nothing).
 *
 * A short sheet over the workout summary, only while the OS permission is
 * still 'prompt' — once ever per device per moment: after the first completed
 * workout ('first_workout'), or on the summary that brings the streak to 3+
 * days ('streak_3'); never both on one summary (utils/pushReAsk
 * pickPostWorkoutReAsk). Marked as shown the moment it opens, so closing the
 * app never brings it back. "כן, תזכירו לי" → the OS
 * prompt first, then push + training reminders on (only if allowed);
 * "לא עכשיו" / backdrop → the deferral is recorded, no OS prompt.
 *
 *   <PushReAskAfterWorkout blocked={surveyOpen} />
 *
 * `blocked`: another post-workout overlay is up (e.g. the survey) — wait.
 */
import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import { ConfirmSheet, SHEET_Z } from '@/components/ui/v2';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { usePushPermission } from '../../hooks/usePushPermission';
import {
  enableRemindersFromReAsk,
  markReAskShown,
  readReAskShownAt,
  recordReminderDeferral,
} from '../../services/reminderOptIn.service';
import { PUSH_SOFT_ASK_COPY, STREAK_SOFT_ASK_TITLE, pickPostWorkoutReAsk } from '../../utils/pushReAsk';

type Shown = { first: number | null; streak: number | null };

/** Let the summary land before asking. */
const OPEN_DELAY_MS = 1800;

export default function PushReAskAfterWorkout({ blocked = false }: { blocked?: boolean }) {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const workoutCount = useUserStore((st) => (st.profile?.progression as { workoutCount?: number } | undefined)?.workoutCount);
  const streakDays = useProgressionStore((s) => s.currentStreak);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  const { permission } = usePushPermission(v2);
  const [shown, setShown] = useState<Shown | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'first_workout' | 'streak_3'>('first_workout');
  const [busy, setBusy] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (!v2) return;
    let alive = true;
    void Promise.all([readReAskShownAt('first_workout'), readReAskShownAt('streak_3')]).then(
      ([first, streak]) => alive && setShown({ first, streak }),
    );
    return () => {
      alive = false;
    };
  }, [v2]);

  useEffect(() => {
    if (!v2 || blocked || decided.current || permission == null || shown === undefined) return;
    if (!auth.currentUser?.uid) return;
    const moment = pickPostWorkoutReAsk({
      permission,
      firstWorkoutShownAt: shown.first,
      streakShownAt: shown.streak,
      workoutCount,
      streakDays,
    });
    if (!moment) return;
    const t = window.setTimeout(() => {
      decided.current = true;
      markReAskShown(moment);
      setKind(moment);
      setOpen(true);
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [v2, blocked, permission, shown, workoutCount, streakDays]);

  if (!v2) return null;

  const defer = () => {
    if (busy) return;
    recordReminderDeferral();
    setOpen(false);
  };
  const accept = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || busy) return;
    setBusy(true);
    try {
      // OS prompt first — enableRemindersFromReAsk's first await.
      await enableRemindersFromReAsk(uid);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <ConfirmSheet
      open={open}
      onClose={defer}
      title={kind === 'streak_3' ? STREAK_SOFT_ASK_TITLE : PUSH_SOFT_ASK_COPY.title}
      description={PUSH_SOFT_ASK_COPY.body}
      zIndex={SHEET_Z.nestedModalPanel}
      backdropZIndex={SHEET_Z.nestedModal}
      actions={[
        { label: PUSH_SOFT_ASK_COPY.accept, tone: 'cta', onClick: () => void accept(), disabled: busy },
        { label: PUSH_SOFT_ASK_COPY.defer, tone: 'ghost', onClick: defer, disabled: busy },
      ]}
    />
  );
}
