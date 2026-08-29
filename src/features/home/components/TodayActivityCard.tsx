'use client';

/**
 * TodayActivityCard — compact redesign (21.08.2026, "ארכיטקטורת הבית
 * ומנוע-ההמלצות" doc — top-of-page carousel, replaces the old tall hero
 * layout below the tabbed stats section).
 *
 * Visual pattern from a David-approved mockup (QuickDraft.dc.html, read
 * directly from its source before building this): solid CATEGORY_COLORS
 * fill, single info column. The mockup's own secondary line shows an XP
 * figure — deliberately omitted here: TodayActivityCardData/
 * todayActivityCards (home/page.tsx) carry no xp field today, confirmed
 * before building this, and David chose to ship without one rather than
 * wire a new data source for this pass. `streak` stays in the interface
 * (no interface changes to that field) but isn't rendered — no room in a
 * compact row, and not part of the mockup.
 *
 * Icon (22.08.2026 update, David-directed): reuses the app's EXISTING
 * program-icon infrastructure (resolveIconKey/getProgramIcon/CheckMarkBadge,
 * @/features/content/programs/core/program-icon.util) instead of a new
 * icon/badge system — the same resolver SmartWeeklySchedule already feeds
 * with a program identifier. The central icon now represents the actual
 * workout type/program; the checkmark moved to a small CheckMarkBadge
 * overlaid on its corner (mirrors SmartDayIcon's own "completed" pattern:
 * colored circle + white icon + corner check). Investigated before
 * building: a saved workout doc carries NO program identifier at all
 * (WorkoutHistoryEntry has no programId/programIds field), but the active
 * program IS available in-memory at the strength-completion moment
 * (active/page.tsx's userProgression.programId) — it just wasn't being
 * threaded through CompletionPayload → sessionStorage →
 * postWorkoutData/completionData. Threaded it through (programId, David:
 * "programId בלבד, לא sessionFocus" — simple/synchronous, already proven
 * by SmartWeeklySchedule, not the richer muscle-derived signal). Only the
 * "rich" card (a specific just-completed workout) ever has a real
 * programId; category-level cards fall back through workoutType/category,
 * same resolver, no new logic invented.
 *
 * TODAY_ACTIVITY_CARD_HEIGHT is exported and consumed by
 * TodayActivityStrip's own cardHeight, so the two stay byte-identical by
 * construction rather than two numbers hoping to agree — SuggestionCarousel's
 * layout/animation breaks if the card's real rendered height and the
 * slot height it's told to expect ever drift apart.
 *
 * Steps-goal card (29.08.2026, Section 2 follow-up — closes a known,
 * flagged-not-fixed rough edge from the past-day summary's first pass):
 * that pass reused this component exactly as instructed for a step-goal
 * achievement too, forcing it through the workout-shaped copy template
 * ("אימון {label} בוצע" + "{minutes} דק' · {category}") with a fabricated
 * `minutes: 0` — there is no duration for a day where only the step goal
 * was met, no workout. `category: 'steps'` below is a small additive
 * branch (not a template rewrite) so that specific case gets accurate
 * copy — every other category is byte-identical to before. Uses
 * CATEGORY_COLORS's existing `steps` color (day-display.utils.tsx), which
 * was already reserved there and simply unused until now.
 */

import React from 'react';
import { CATEGORY_COLORS } from '@/features/home/utils/day-display.utils';
import { resolveIconKey, getProgramIcon, CheckMarkBadge } from '@/features/content/programs/core/program-icon.util';
import type { ActivityCategory } from '@/features/activity/types/activity.types';

export interface TodayActivityCardData {
  key: string;
  /**
   * 'steps' (29.08.2026) is a card-display-only extension for a met
   * step-goal day — deliberately not added to the shared `ActivityCategory`
   * type (activity.types.ts stays the strict 3-way strength|cardio|
   * maintenance every other consumer relies on). Pairs with `stepsAchieved`
   * below instead of `minutes` (a steps day has no workout duration).
   */
  category: ActivityCategory | 'steps';
  title: string;
  minutes: number;
  /** Only set for a 'steps' card — real value from that day's goalHistory entry. */
  stepsAchieved?: number;
  thumbnailUrl?: string;
  streak: number;
  /**
   * Strength-only active-program templateId (e.g. 'upper_body', 'push') —
   * only ever populated for the one "rich" card describing a specific
   * just-completed workout (22.08.2026 icon fix). Undefined for category-
   * level cards and every non-strength workoutType, matching resolveIconKey's
   * own "no explicit key → fall back" contract — not a data gap to guard
   * against, just the honest absence of a specific program for those cases.
   */
  programId?: string;
  /**
   * The real CompletionWorkoutType ('running'|'walking'|'cycling'|'strength'|
   * 'hybrid') for the rich card — lets icon resolution distinguish walking
   * from running/cycling instead of collapsing them into the coarser
   * `category` ('cardio'). Same already-flowing completionData.workoutType
   * used elsewhere on this screen; no new data source.
   */
  workoutType?: string;
}

export const TODAY_ACTIVITY_CARD_HEIGHT = 64;

const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  strength: 'כוח',
  cardio: 'אירובי',
  maintenance: 'גמישות',
};

export default function TodayActivityCard({
  category,
  title,
  minutes,
  stepsAchieved,
  programId,
  workoutType,
}: TodayActivityCardData) {
  const color = CATEGORY_COLORS[category];
  // `title` sometimes already carries an "אימון " prefix (home/page.tsx's
  // category-label fallback, e.g. "אימון כוח") and sometimes doesn't (a
  // real workout title like "כל הגוף") — strip it so the template below
  // never doubles up into "אימון אימון כוח בוצע". A 'steps' card's title
  // never carries that prefix (its caller sets it directly), so this is a
  // safe no-op for it.
  const label = title.replace(/^אימון\s+/, '');
  // Same resolver SmartWeeklySchedule already uses: explicit programId first
  // (real strength program, e.g. resolves 'upper_body' → the muscle icon),
  // falling back to workoutType (distinguishes walking/running/cycling) or
  // bare category (maintenance → core, cardio → shoe, strength → muscle) when
  // no specific program is known — never invents anything resolveIconKey's
  // own table doesn't already define. 'steps' isn't a key resolveIconKey's
  // own alias table knows — falls back to 'walking' explicitly so a steps
  // card gets the real walking icon instead of the generic muscle default
  // (callers are expected to pass workoutType:'walking' anyway; this is
  // defense-in-depth for a caller that doesn't).
  const iconKey = resolveIconKey(programId, workoutType ?? (category === 'steps' ? 'walking' : category));

  return (
    <div
      className="w-full h-full flex items-center gap-3 overflow-hidden"
      dir="rtl"
      style={{
        borderRadius: 18,
        background: color,
        padding: '0 16px',
        boxShadow: `0 3px 10px ${color}47`,
      }}
    >
      <div
        className="relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.24)' }}
      >
        <div className="text-white">{getProgramIcon(iconKey, 'w-5 h-5')}</div>
        <div className="absolute -bottom-1 -right-1">
          <CheckMarkBadge size={16} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="block text-[15.5px] font-extrabold text-white truncate">
          {category === 'steps' ? label : `אימון ${label} בוצע`}
        </span>
        <span
          className="block text-[12.5px] font-semibold truncate mt-0.5"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          {category === 'steps'
            ? `${(stepsAchieved ?? 0).toLocaleString('he-IL')} צעדים`
            : `${minutes} דק' · ${CATEGORY_LABEL[category]}`}
        </span>
      </div>
    </div>
  );
}
