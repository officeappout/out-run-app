'use client';

/**
 * useTrainingHerePublish — writes the sheet's arrival through the EXISTING planned_sessions path
 * (createPlannedSession, the same write the park / route "אני מגיע" flows use). The park page's
 * "מתאמנים כאן" list (useParkEvents' planned_sessions listener) then shows it with no change.
 */
import { useCallback, useState } from 'react';
import { auth } from '@/lib/firebase';
import { createPlannedSession } from '@/features/admin/services/planned-sessions.service';
import {
  buildArrivalInput,
  type TrainingHereActivity,
  type TrainingHerePlace,
  type TrainingHereVisibility,
} from './training-here.logic';

export function useTrainingHerePublish() {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const publish = useCallback(async (args: {
    place: TrainingHerePlace;
    activity: TrainingHereActivity;
    startTime: Date;
    visibility: TrainingHereVisibility;
  }): Promise<string | null> => {
    const user = auth.currentUser;
    if (!user) { setFailed(true); return null; }
    setSaving(true);
    setFailed(false);
    try {
      return await createPlannedSession(buildArrivalInput({
        userId: user.uid,
        displayName: user.displayName ?? user.email ?? 'משתמש', // i18n-allow-hebrew: data — written to planned_sessions.displayName (the compose sheet's fallback)
        photoURL: user.photoURL ?? null,
        ...args,
      }));
    } catch (err) {
      console.error('[TrainingHereSheet] createPlannedSession failed:', err);
      setFailed(true);
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  return { publish, saving, failed, resetFailed: () => setFailed(false) };
}
