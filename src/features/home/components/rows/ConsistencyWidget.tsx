"use client";

/**
 * ConsistencyWidget — Row 2 LEFT (35% column) in the new dashboard.
 *
 * Visual model lifted directly from the strength tile in
 * `StatsOverview`'s legacy "Power Row" (5fr/8fr grid):
 *   short caption ("כוח" / "ריצה") + count, with a row of segmented
 *   bars below. Sized to fit the 35% column next to the full
 *   `ProgramProgressCard` while keeping the same card chrome
 *   (`WIDGET_CARD_STYLE`) so both halves of Row 2 read as one unit.
 *
 * Ghosting: when a survey is missing, the row is wrapped in
 * `<GhostUpsell variant="silent">` — bars stay visible (blurred), no
 * "Add Run" copy. A small `+` affordance in the corner signals that
 * the surface is tappable; tapping routes to the matching onboarding.
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import { useWeeklyProgress, getStrengthAdherence } from '@/features/activity';
import { WIDGET_CARD_STYLE } from '@/features/home/components/widgets/StrengthVolumeWidget';
import { GhostUpsell } from './GhostUpsell';
import { hasStrengthSurvey, hasRunSurvey } from '@/features/home/hooks/useProgramProgress';

const STRENGTH_ONBOARDING_HREF = '/onboarding-new/program-path?track=strength';
const RUN_ONBOARDING_HREF = '/onboarding-new/program-path?track=run';

interface MiniBarsProps {
  /** Short Hebrew caption, e.g. "כוח" or "ריצה". */
  caption: string;
  /** Sessions completed this week. */
  done: number;
  /** Sessions targeted this week. */
  target: number;
  /** Filled segment colour (defaults to brand cyan). */
  fillColor?: string;
  /** Optional inline icon override (small SVG). */
  icon?: React.ReactNode;
}

/**
 * Single "caption + count + bar row" — matches the strength tile from
 * the original Power Row at lines 1107-1140 of `StatsOverview` (now
 * removed).
 */
function MiniBars({ caption, done, target, fillColor = '#00C9F2', icon }: MiniBarsProps) {
  const safeTarget = Math.max(1, target);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1">
          {icon}
          <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
            {caption}
          </span>
        </div>
        <span
          className="text-sm font-black text-gray-900 dark:text-white tabular-nums leading-none"
          dir="ltr"
        >
          {done}/{safeTarget}
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: safeTarget }).map((_, i) => (
          <div
            key={i}
            className="flex-1 h-[5px] rounded-full overflow-hidden"
            style={{ backgroundColor: '#F1F5F9' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: i < done ? '100%' : '0%',
                backgroundColor: fillColor,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* Tiny inline icons that match the legacy Power Row strength glyph
   (kept inline so the 35% column doesn't have to load lucide for two
   tiny shapes). */
function StrengthGlyph() {
  return (
    <svg
      width="13"
      height="11"
      viewBox="0 0 13 11"
      fill="none"
      className="text-gray-800 dark:text-gray-200 flex-shrink-0"
    >
      <path
        d="M11.875 8.49641C11.6642 9.35355 10.5787 9.5625 9.88848 9.5625C8.3983 9.5625 2.71702 9.5625 2.71702 9.5625C1.30519 9.5625 0.227331 7.96126 0.766428 6.5655C1.95888 4.46229 3.02976 2.83719 3.64838 0.894899C5.07769 0.0616627 6.91005 0.894898 6.4791 2.2858M4.64655 2.83719C3.87448 3.99641 4.30703 5.28212 3.64838 6.5655C5.60422 5.28159 7.52284 5.02481 9.60907 6.5655"
        stroke="currentColor"
        strokeWidth="1.125"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RunGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      className="text-gray-800 dark:text-gray-200 flex-shrink-0"
    >
      <path
        d="M13 4a2 2 0 1 1-2-2 2 2 0 0 1 2 2zM7.5 22l1.5-7 3 2v6m1-13l-1.5 4 3 3 5 1m-7-8 4-2 3 2 2 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ConsistencyWidget() {
  const router = useRouter();
  const { profile } = useUserStore();
  const { summary } = useWeeklyProgress();

  const strengthDone = hasStrengthSurvey(profile);
  const runDone = hasRunSurvey(profile);

  const { done: strengthSessions, target: strengthTarget } = getStrengthAdherence(profile, summary);
  const cardioSessions = summary?.categorySessions?.cardio ?? 0;
  const runTarget = profile?.running?.weeklyFrequency
    ?? profile?.running?.scheduleDays?.length
    ?? 3;

  const strengthRow = (
    <MiniBars
      caption="כוח"
      done={strengthSessions}
      target={strengthTarget}
      icon={<StrengthGlyph />}
    />
  );

  const runRow = (
    <MiniBars
      caption="ריצה"
      done={cardioSessions}
      target={runTarget}
      fillColor="#84CC16"
      icon={<RunGlyph />}
    />
  );

  return (
    <div
      className="bg-white dark:bg-slate-800 w-full h-full flex flex-col justify-center gap-4 overflow-hidden"
      style={WIDGET_CARD_STYLE}
      dir="rtl"
    >
      {strengthDone ? (
        strengthRow
      ) : (
        <GhostUpsell
          variant="silent"
          onClick={() => router.push(STRENGTH_ONBOARDING_HREF)}
          label="הוסף תוכנית כוח"
        >
          {strengthRow}
        </GhostUpsell>
      )}

      {runDone ? (
        runRow
      ) : (
        <GhostUpsell
          variant="silent"
          onClick={() => router.push(RUN_ONBOARDING_HREF)}
          label="הוסף תוכנית ריצה"
        >
          {runRow}
        </GhostUpsell>
      )}
    </div>
  );
}

export default ConsistencyWidget;
