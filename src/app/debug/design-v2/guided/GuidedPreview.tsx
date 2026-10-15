'use client';

/**
 * Fixture preview for the guided station layer screens (dev only — see page.tsx).
 * Renders the REAL components with demo props; nothing here reaches Firestore.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { WorkoutPlan } from '@/features/parks';
import StationWelcomeScreen from '@/features/workout-engine/hybrid/StationWelcomeScreen';
import StationCompleteScreen from '@/features/workout-engine/hybrid/StationCompleteScreen';
import FindEquipmentOverlay from '@/features/workout-engine/players/strength/components/FindEquipmentOverlay';
import DemoGateOverlay from '@/features/workout-engine/players/strength/components/DemoGateOverlay';
import { stationTutorialSeenKey } from '@/features/workout-engine/hybrid/station-tutorial';
import { removeOnboardingPref, setOnboardingPref } from '@/lib/onboardingPrefs';
import type { StationContext } from '@/features/workout-engine/hybrid/station-flow';
import type { FindScreen } from '@/features/workout-engine/players/strength/logic/find-equipment';

const PLAN = {
  id: 'preview-plan',
  name: 'תחנה בגינה',
  segments: [
    {
      id: 'seg-1',
      type: 'station',
      title: 'תחנה',
      exercises: [
        { id: 'ex-1', name: 'מתח אוסטרלי', reps: '8-10 חזרות', exerciseType: 'reps' },
        { id: 'ex-2', name: 'שכיבות סמיכה', reps: '10-12 חזרות', exerciseType: 'reps' },
        { id: 'ex-3', name: 'פלאנק', duration: '30 שניות', exerciseType: 'time' },
      ],
    },
    {
      id: 'seg-2',
      type: 'station',
      title: 'טבטה',
      protocol: 'tabata',
      exercises: [{ id: 'ex-4', name: 'סקוואט קפיצה', duration: '20 שניות' }],
    },
  ],
} as unknown as WorkoutPlan;

const CONTEXT: StationContext = {
  isFinalStation: false,
  nextStationName: 'גינת הכושר פארק הירקון',
  nextWalkSec: 420,
  nextLegKind: 'walking',
  parkId: 'park-1',
  parkName: 'גינת כושר גן מאיר',
  stationNumber: 1,
  stationTotal: 3,
  estimatedMin: 12,
  availableEquipment: null,
  locationKey: 'park-1',
};

const FIND_SINGLE: FindScreen = {
  kind: 'single',
  items: [{ exIdx: 0, exerciseId: 'ex-1', exerciseName: 'מתח אוסטרלי', equipmentIds: ['pullup_bar'] }],
};
const FIND_TABATA: FindScreen = {
  kind: 'tabata',
  items: [
    { exIdx: 0, exerciseId: 'ex-1', exerciseName: 'מתח אוסטרלי', equipmentIds: ['pullup_bar'] },
    { exIdx: 1, exerciseId: 'ex-5', exerciseName: 'מקבילים', equipmentIds: ['parallel_bars'] },
  ],
};

const noop = () => {};

export default function GuidedPreview() {
  const params = useSearchParams();
  const state = params.get('state') ?? 'welcome';
  const step = Number(params.get('step') ?? 0);
  const uid = state === 'coach' ? 'preview-coach' : 'preview-seen';
  const [ready, setReady] = useState(false);

  // The welcome screen reads the seen-once tutorial flag on mount — set/clear it first.
  useEffect(() => {
    if (state === 'coach') removeOnboardingPref(stationTutorialSeenKey(uid));
    else setOnboardingPref(stationTutorialSeenKey(uid), 'done');
    setReady(true);
  }, [state, uid]);

  // Advance the coach-marks to ?step=N by pressing "הבא" (preview only).
  useEffect(() => {
    if (!ready || state !== 'coach' || step <= 0) return;
    let n = 0;
    const t = setInterval(() => {
      const next = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'הבא');
      if (next) { next.click(); n += 1; }
      if (n >= step) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [ready, state, step]);

  if (!ready) return null;

  return (
    <div className="relative w-full overflow-hidden" style={{ height: '100dvh' }}>
      {(state === 'welcome' || state === 'coach') && (
        <StationWelcomeScreen plan={PLAN} context={CONTEXT} gender="male" onStart={noop} guided uid={uid} />
      )}
      {state === 'find' && <FindEquipmentOverlay screen={FIND_SINGLE} gender="male" onFound={noop} onSwap={noop} />}
      {state === 'find-tabata' && <FindEquipmentOverlay screen={FIND_TABATA} gender="male" onFound={noop} onSwap={noop} />}
      {state === 'gate' && (
        <>
          {/* Stand-in for the looping demo clip behind the gate. */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg,#1e293b 0%,#0f172a 60%,#00384a 100%)' }} />
          <DemoGateOverlay
            exerciseName="מתח אוסטרלי"
            cue="אחיזה ברוחב הכתפיים, גוף ישר מהעקבים עד הראש"
            ctaLabel="צפיתי, התחל"
            onStart={noop}
          />
        </>
      )}
      {(state === 'complete' || state === 'complete-fast') && (
        <StationCompleteScreen
          summary={{ exerciseLog: [], completedAtMs: 0, exercises: 4, minutes: 11 }}
          context={CONTEXT}
          onContinue={noop}
          fastPrompt={state === 'complete-fast' ? { onAccept: noop } : undefined}
        />
      )}
    </div>
  );
}
