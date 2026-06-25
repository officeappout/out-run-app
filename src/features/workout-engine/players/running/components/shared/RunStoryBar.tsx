'use client';

/**
 * RunStoryBar — swipeable multi-story progress bar for all running sessions.
 *
 * Replaces GuidedRouteProgressStrip (single metric, guided-only).
 * Always visible during an active run (not gated on goal existence).
 *
 * Stories built by buildRunStories() — add new kinds by defining a StorySpec
 * const and pushing it inside that builder. This component is a dumb renderer.
 *
 * Navigation: dot tap (swipe avoided to prevent conflict with outer drag-to-minimize).
 * Story 2 (versus) auto-selected when the user taps a rival avatar in SideRail.
 */

import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { computeStandings } from '@/features/workout-engine/players/running/lib/computeStandings';
import { buildRunStories } from '@/features/workout-engine/players/running/lib/buildRunStories';
import RouteStoryBar from './RouteStoryBar';

// ─────────────────────────────────────────────────────────────────────────────
// Track story — 2-dot race visual
// ─────────────────────────────────────────────────────────────────────────────

interface TrackStoryProps {
  meKm: number;
  rivalKm: number;
  goalKm: number;
  gapM: number;
  myColor: string;
  rivalColor: string;
  isPaused: boolean;
}

function TrackStory({ meKm, rivalKm, goalKm, gapM, myColor, rivalColor, isPaused }: TrackStoryProps) {
  const mePct = Math.min(100, (meKm / goalKm) * 100);
  const rivalPct = Math.min(100, (rivalKm / goalKm) * 100);
  const iLead = gapM >= 0;

  return (
    <div className="w-full px-5 pt-3 pb-2" dir="rtl">
      {/* Label row */}
      <div className="flex items-baseline justify-between mb-1.5">
        <span
          className="text-[10px] font-black tracking-[0.18em] uppercase opacity-80"
          style={{ color: iLead ? myColor : rivalColor }}
        >
          מובילות
        </span>
        <span
          className="text-[14px] font-black tabular-nums leading-none"
          dir="ltr"
          style={{ color: 'rgba(15,23,42,0.92)', letterSpacing: '-0.01em' }}
        >
          {iLead
            ? `מוביל ב-${Math.abs(gapM)} מ'`
            : `מפגר ב-${Math.abs(gapM)} מ'`}
        </span>
      </div>

      {/* Track */}
      <div
        className="relative w-full rounded-full"
        style={{
          height: 12,
          background: 'rgba(15, 23, 42, 0.07)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.10)',
        }}
      >
        {/* Fill up to the leader's position (neutral bg) */}
        <div
          className="absolute inset-y-0 right-0 rounded-full"
          style={{
            width: `${Math.max(mePct, rivalPct)}%`,
            background: 'rgba(0,0,0,0.08)',
            transition: isPaused ? 'none' : 'width 0.4s ease',
          }}
        />

        {/* Rival dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{
            width: 14,
            height: 14,
            background: rivalColor,
            right: `calc(${rivalPct}% - 7px)`,
            boxShadow: `0 0 8px ${rivalColor}99`,
            transition: isPaused ? 'none' : 'right 0.4s ease',
            zIndex: 1,
          }}
        />

        {/* My dot — rendered above rival on overlap */}
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{
            width: 14,
            height: 14,
            background: myColor,
            right: `calc(${mePct}% - 7px)`,
            boxShadow: `0 0 8px ${myColor}99`,
            transition: isPaused ? 'none' : 'right 0.4s ease',
            zIndex: 2,
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RunStoryBar
// ─────────────────────────────────────────────────────────────────────────────

interface RunStoryBarProps {
  isPaused?: boolean;
}

export default function RunStoryBar({ isPaused = false }: RunStoryBarProps) {
  const totalDistance = useSessionStore((s) => s.totalDistance);
  const totalDuration = useSessionStore((s) => s.totalDuration);
  const currentPace = useRunningPlayer((s) => s.currentPace);
  const sessionGoal = useRunningPlayer((s) => s.sessionGoal);
  const { selectedParticipantUid, activeStoryIndex, setActiveStoryIndex, groupParticipants } =
    useMapStore();

  const standings = computeStandings(totalDistance, selectedParticipantUid, groupParticipants);

  // Collective fields — only meaningful when partners are present.
  // groupActiveCount: partners whose distanceKm > 0, plus self (always active here).
  // groupGoalTarget: MVP ×N — replace with per-partner sum once goalValue lands in presence.
  const hasPartners = groupParticipants.length > 0;
  const partnersWithDistance = groupParticipants.filter((p) => p.distanceKm > 0);
  const groupActiveCount = hasPartners ? partnersWithDistance.length + 1 : null;
  const groupTotalDistance = hasPartners
    ? totalDistance + groupParticipants.reduce((s, p) => s + p.distanceKm, 0)
    : null;
  const groupGoalUnit: 'distance' | 'time' | null =
    sessionGoal?.type === 'distance' ? 'distance'
    : sessionGoal?.type === 'time' ? 'time'
    : null;
  const groupGoalTarget =
    groupGoalUnit === 'distance' && groupActiveCount !== null && sessionGoal
      ? groupActiveCount * sessionGoal.value
      : null;

  const ctx = {
    totalDistance, totalDuration, currentPace, sessionGoal,
    selectedUid: selectedParticipantUid, standings,
    groupTotalDistance, groupGoalTarget, groupActiveCount, groupGoalUnit,
  };
  const stories = buildRunStories(ctx);

  const safeIdx = Math.min(activeStoryIndex, stories.length - 1);
  const story = stories[safeIdx];

  const trackData = story.render === 'track' ? story.getTrack?.(ctx) ?? null : null;
  const progress = story.getProgress ? (story.getProgress(ctx) ?? 0) / 100 : 0;

  return (
    <div style={{ fontFamily: 'var(--font-simpler)' }}>
      {/* Story content */}
      {story.render === 'fill' ? (
        <RouteStoryBar
          progress={progress}
          isPaused={isPaused}
          label={story.label}
          valueText={story.getValue(ctx)}
        />
      ) : trackData ? (
        <TrackStory {...trackData} isPaused={isPaused} />
      ) : (
        <RouteStoryBar progress={0} isPaused={isPaused} label={story.label} valueText="—" />
      )}

      {/* Dot navigation — only when more than 1 story */}
      {stories.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-2 -mt-1">
          {stories.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveStoryIndex(i);
              }}
              className="rounded-full transition-all"
              style={{
                height: 4,
                width: i === safeIdx ? 20 : 6,
                background:
                  i === safeIdx
                    ? '#00ADEF'
                    : 'rgba(15,23,42,0.20)',
              }}
              aria-label={`עבור לסטורי ${s.label}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
