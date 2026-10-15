/**
 * guided-station.service — the (small) writes behind the guided station layer (PR-B1).
 * Same target as SettingsModal's debounced writer: users/{uid}.settings.*. Every write also
 * mirrors into the local user store so the very next station reads the new value without
 * waiting for a profile refresh. Failures are logged, never thrown (a missed counter tick
 * must not break a workout).
 */
import { doc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import {
  GUIDED_SETTING_KEY, GUIDED_COMPLETED_COUNT_KEY, GUIDED_FAST_PROMPT_ASKED_KEY, readGuidedSettings,
} from './guided-station';

function mirrorLocal(patch: Record<string, unknown>): void {
  const store = useUserStore.getState();
  const profile = store.profile as unknown as { settings?: Record<string, unknown> } | null;
  if (!profile) return;
  store.updateProfile({ settings: { ...(profile.settings ?? {}), ...patch } } as never);
}

async function write(update: Record<string, unknown>): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'users', uid), update);
  } catch (err) {
    console.error('[GuidedStation] settings write failed:', update, err);
  }
}

/** The "ליווי צעד-אחר-צעד" choice (also used by the switch-to-fast prompt). */
export function setGuidedStationChoice(enabled: boolean): void {
  mirrorLocal({ guidedStation: enabled });
  void write({ [GUIDED_SETTING_KEY]: enabled });
}

/** +1 completed guided station. Returns the NEW count (local view) for the prompt decision. */
export function recordGuidedStationCompleted(): number {
  const next = readGuidedSettings(useUserStore.getState().profile).guidedStationsCompleted + 1;
  mirrorLocal({ guidedStationsCompleted: next });
  void write({ [GUIDED_COMPLETED_COUNT_KEY]: increment(1) });
  return next;
}

/** Remember that "כבר הבנת? לעבור למצב מהיר" was shown (never ask again). */
export function markFastPromptAsked(): void {
  mirrorLocal({ guidedFastPromptAsked: true });
  void write({ [GUIDED_FAST_PROMPT_ASKED_KEY]: true });
}
