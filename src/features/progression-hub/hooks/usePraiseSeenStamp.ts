'use client';
/**
 * Pilot N5 (enable_workout_praise_push): opening the progress screen stamps
 * streaks/{uid}.praiseSeenAt, so the 20:00 "כל הכבוד" push (workoutPraiseScheduler) skips a
 * user who already looked at their progress after the day's last workout. A merge write of one
 * extra field, like milestoneSeen: the streaks rule's "unchanged" branch accepts it. Off = no write.
 */
import { useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function usePraiseSeenStamp(): void {
  const uid = useUserStore((s) => s.profile?.id ?? null);
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  const on = !loading && flags.enableWorkoutPraisePush;
  useEffect(() => {
    if (!on || !uid) return;
    setDoc(doc(db, 'streaks', uid), { praiseSeenAt: Date.now() }, { merge: true }).catch((err) => {
      console.warn('[progression] praiseSeenAt write skipped:', err);
    });
  }, [on, uid]);
}
