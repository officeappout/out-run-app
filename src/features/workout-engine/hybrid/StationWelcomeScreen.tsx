'use client';

/**
 * StationWelcomeScreen — guided-mode "welcome to the station" (PR-B1).
 *
 * Shown by HybridStationLayer after "📍 הגעתי לתחנה" and BEFORE StrengthRunner mounts (so
 * before its PREPARING countdown). Fast mode never renders it. Content: "תחנה N מתוך M", the
 * park name, the planned duration, and the station's exercise list — rendered with the SAME
 * row component StationCard uses (StationExerciseRow) plus a "זמן" (Timer) / "חזרות" (Repeat)
 * chip per exercise. The existing "דלג על התחנה" pill stays rendered by the layer above this screen.
 *
 * PR-B4: the first time a user ever reaches a guided welcome screen, three coach-mark bubbles
 * explain the start CTA, the זמן/חזרות chips and pause/skip (station-tutorial.ts). Seen-once flag in
 * onboardingPrefs, keyed by uid; "דלג" counts as seen.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Pause, Repeat, SkipForward, Timer, type LucideIcon } from 'lucide-react';
import { Chip } from '@/components/ui/v2';
import CoachMarks, { type CoachMarkStep } from '@/components/ui/CoachMarks';
import { getOnboardingPrefAsync, setOnboardingPref } from '@/lib/onboardingPrefs';
import type { WorkoutPlan } from '@/features/parks';
import BrandCtaButton from '@/components/ui/BrandCtaButton';
import StationExerciseRow from '@/features/workout-engine/players/strength/components/StationExerciseRow';
import type { StationContext } from './station-flow';
import { WELCOME_GREETING, welcomeCta, exerciseTypeChip } from './guided-station';
import {
  COACH_TARGET_CHIPS, COACH_TARGET_START,
  shouldShowStationTutorial, stationTutorialSeenKey, stationTutorialSteps,
  type StationTutorialIcon, type StationTutorialStep,
} from './station-tutorial';
import type { AppGender } from '@/lib/utils/gendered-text';

/** The same lucide icons the chips / player use — the coach-mark legend shows them, not emoji. */
const TUTORIAL_ICON: Record<StationTutorialIcon, { icon: LucideIcon; tone: 'accent' | 'neutral' }> = {
  time: { icon: Timer, tone: 'accent' },
  reps: { icon: Repeat, tone: 'neutral' },
  pause: { icon: Pause, tone: 'neutral' },
  skip: { icon: SkipForward, tone: 'neutral' },
};

function toCoachMarkStep({ legend, ...step }: StationTutorialStep): CoachMarkStep {
  return legend
    ? { ...step, legend: legend.map((l) => ({ ...TUTORIAL_ICON[l.icon], text: l.text })) }
    : step;
}

interface Props {
  plan: WorkoutPlan;
  context: StationContext;
  gender: AppGender | null | undefined;
  onStart: () => void;
  /** PR-B4: guided mode on (the layer only renders this screen in guided mode). */
  guided: boolean;
  /** PR-B4: whose seen-once tutorial flag to read/write. */
  uid: string | null | undefined;
}

export default function StationWelcomeScreen({ plan, context, gender, onStart, guided, uid }: Props) {
  // PR-B4: first-time tutorial — resolved async (native cold start may have evicted localStorage).
  const [showTutorial, setShowTutorial] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!guided) { setShowTutorial(false); return; }
    void getOnboardingPrefAsync(stationTutorialSeenKey(uid)).then((seen) => {
      if (alive) setShowTutorial(shouldShowStationTutorial(guided, seen));
    });
    return () => { alive = false; };
  }, [guided, uid]);
  const finishTutorial = (reason: 'done' | 'skip') => {
    setOnboardingPref(stationTutorialSeenKey(uid), reason); // skip = seen too
    setShowTutorial(false);
  };

  const rows = plan.segments.flatMap((seg) =>
    (seg.exercises ?? []).map((ex) => ({ ex, inTabata: seg.protocol === 'tabata' })),
  );
  return (
    <motion.div
      key="station-welcome"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="absolute inset-0 flex flex-col bg-white"
      dir="rtl"
    >
      <div
        className="flex-1 overflow-y-auto px-5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
      >
        <p className="text-[13px] font-bold text-[#00ADEF] mb-1">
          תחנה {context.stationNumber} מתוך {context.stationTotal}
        </p>
        <h1 className="text-[26px] font-black text-gray-900 leading-tight mb-1" style={{ fontFamily: 'var(--font-simpler)' }}>
          {WELCOME_GREETING}
        </h1>
        <p className="text-[15px] font-bold text-gray-600 mb-4">
          {context.parkName ?? 'גינת כושר'}
          {context.estimatedMin != null && <span className="text-gray-400"> · כ-{context.estimatedMin} דק׳</span>}
        </p>

        <div className="space-y-3 pb-4">
          {rows.map(({ ex, inTabata }, idx) => {
            const chip = exerciseTypeChip(ex, inTabata);
            return (
              <StationExerciseRow
                key={`${ex.id || 'ex'}-${idx}`}
                ex={ex}
                trailing={
                  <Chip
                    data-coach={idx === 0 ? COACH_TARGET_CHIPS : undefined}
                    tone={chip === 'time' ? 'accent' : 'neutral'}
                    className="flex-shrink-0"
                    icon={chip === 'time'
                      ? <Timer size={14} strokeWidth={2.4} aria-hidden />
                      : <Repeat size={14} strokeWidth={2.4} aria-hidden />}
                  >
                    {chip === 'time' ? 'זמן' : 'חזרות'}
                  </Chip>
                }
              />
            );
          })}
        </div>
      </div>

      <div className="px-5 pt-2" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 20px))' }}>
        <div data-coach={COACH_TARGET_START}>
          <BrandCtaButton onClick={onStart} className="w-full h-14 rounded-full text-[16px] font-bold">
            {welcomeCta(gender)}
          </BrandCtaButton>
        </div>
      </div>

      {showTutorial && <CoachMarks steps={stationTutorialSteps(gender).map(toCoachMarkStep)} onFinish={finishTutorial} />}
    </motion.div>
  );
}
