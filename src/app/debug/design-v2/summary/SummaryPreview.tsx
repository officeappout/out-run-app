'use client';

import { useAnimation } from 'framer-motion';
import AerobicSummaryView from '@/features/workout-engine/summary/components/aerobic/AerobicSummaryView';
import HybridSummary from '@/features/workout-engine/summary/pages/HybridSummary';
import StrengthSummaryView from '@/features/workout-engine/components/strength/StrengthSummaryView';
import {
  aerobicWorkout,
  GROUP_CTX,
  HYBRID_RESULT,
  STRENGTH_EXERCISES,
  STRENGTH_GOALS,
  groupStrength,
} from './fixtures';

const noop = () => {};
const noopAsync = async () => {};

/** Static stand-in for the live Mapbox map (never mount Mapbox in a preview). */
function MapPlaceholder() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(120% 80% at 20% 10%, #dff3ea 0%, transparent 60%), radial-gradient(90% 70% at 90% 60%, #d9ecf7 0%, transparent 55%), linear-gradient(160deg, #eef3ee 0%, #e4ece6 45%, #dde8ef 100%)',
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <g stroke="#ffffff" strokeWidth="10" fill="none" opacity="0.9">
          <path d="M-20 120 L420 60" />
          <path d="M-20 300 L420 260" />
          <path d="M80 -20 L140 900" />
          <path d="M290 -20 L250 900" />
        </g>
        <g stroke="#ffffff" strokeWidth="4" fill="none" opacity="0.7">
          <path d="M-20 200 L420 180" />
          <path d="M190 -20 L200 900" />
          <path d="M-20 420 L420 400" />
        </g>
        <rect x="150" y="140" width="110" height="90" rx="14" fill="#cfe9d6" />
        <path
          d="M110 260 C 140 180, 230 150, 270 210 S 300 330, 220 340 S 120 320, 110 260 Z"
          stroke="#00baf7"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="110" cy="260" r="8" fill="#0e1419" />
      </svg>
    </div>
  );
}

function MapBackdrop() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
      <MapPlaceholder />
    </div>
  );
}

function StrengthPreview() {
  const xpControls = useAnimation();
  return (
    <StrengthSummaryView
      programName="כוח פלג גוף עליון"
      programId="upper_body"
      maxLevel={25}
      isReadOnly={false}
      completedExercises={STRENGTH_EXERCISES}
      analytics={{
        calories: 286,
        formattedDuration: '38:12',
        streak: 4,
        streakFlameType: 'micro',
        liveLevel: 7,
        livePercent: 64,
        weeklyStrengthSessions: 2,
        weeklyGoalSessions: 3,
        coins: 0,
        daysWithActivity: 4,
        weeklyMinutes: 142,
        groupedExercises: groupStrength(STRENGTH_EXERCISES),
      }}
      xp={{
        xpStatus: 'awarded',
        xpEarnedAmount: 120,
        xpControls,
        streakChainReady: true,
        runAwardXP: noopAsync,
      }}
      progression={{ progressionResult: null, showLevelUpModal: false, setShowLevelUpModal: noop }}
      email={{
        showEmailDrawer: false,
        showInlineAccount: false,
        setShowInlineAccount: noop,
        handleEmailCaptured: noop,
        dismissEmailDrawer: noop,
      }}
      evaluatedGoals={STRENGTH_GOALS}
      visibleSuggestions={[]}
      onAcceptSuggestion={noop}
      onDismissSuggestion={noop}
      showLifestyleCTA={false}
      onScheduleLifestyle={noop}
      onDismissLifestyle={noop}
      isFinishing={false}
      onPrimaryAction={noop}
    />
  );
}

export default function SummaryPreview({ variant, snap }: { variant: string; snap?: string }) {
  void snap; // wired once the drawer becomes a DraggableSheet

  if (variant === 'strength') return <StrengthPreview />;

  if (variant === 'hybrid') {
    return (
      <>
        <MapBackdrop />
        <HybridSummary
          result={HYBRID_RESULT}
          calories={318}
          streakDays={4}
          onFinish={noop}
        />
      </>
    );
  }

  const group = variant === 'group';
  const activityType = variant === 'walking' ? 'walking' : 'running';
  return (
    <>
      <MapBackdrop />
      <AerobicSummaryView
        variant={group ? 'group' : 'solo'}
        activityType={activityType}
        workout={aerobicWorkout(activityType)}
        currentUid="fixture-user"
        streakDays={4}
        onSave={noop}
        onClose={noop}
        xpEarned={0}
        groupCtx={group ? GROUP_CTX : null}
        groupLoading={false}
        savedWorkoutId="fixture-run"
        renderMap={() => <MapPlaceholder />}
        submitRating={noopAsync}
        deleteLastWorkout={noopAsync}
        deleteWorkoutWithReversal={noopAsync}
      />
    </>
  );
}
