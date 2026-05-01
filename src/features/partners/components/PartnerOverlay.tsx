'use client';

/**
 * PartnerOverlay — full-screen overlay shown when the user enters the
 * Partner Hub. Map remains visible behind a translucent **white** backdrop,
 * and the overlay carries:
 *
 *   1. Title + subtitle (per tab)
 *   2. Tab pills with counts + close button
 *   3. PartnerFilterBar (multi-row, tab-aware, dynamic per activity)
 *   4. Horizontal scroll list of PartnerCards (or PartnerEmptyState)
 *   5. PartnerFilterSheet (lazily visible drag-to-dismiss filter sheet)
 *
 * Visual: light theme — white blurred backdrop, dark text. Replaced the
 * previous dark theme so cards/text stay legible against the map.
 *
 * Smart defaults — applied ONLY when `liveActivity === 'all'` so the
 * overlay never resets a user's manual choices on re-open. Defaults are
 * derived once on mount, in this priority order:
 *   1. Running profile (if `running.isUnlocked && running.activeProgram`)
 *   2. Strength profile (if `progression.activePrograms.length > 0`)
 *   3. Time slider seed (running/strength/general reminder time)
 *
 * Tab handling — Option C for [קבוצות] on the live tab:
 *   live partners (presence/{uid}) carry no group identifier, so a
 *   "groups" filter on the live tab would always return zero results.
 *   When the user taps [קבוצות] from the live tab, PartnerFilterBar
 *   fires `onSwitchToScheduled`, we flip `activeTab` to 'scheduled' and
 *   show a transient hint (`"מציג קבוצות מתוכננות"`).
 *
 * Filtering:
 *   - Live: activity + (lemurStage when 'all'/walking, programLevel when
 *     'strength') for the level range pill, plus parsed `mockPace`
 *     against `paceRange` when activity is running. soloGroupFilter is
 *     a no-op on the live tab (Option C handles the transition).
 *   - Scheduled: source vs soloGroupFilter (planned/group/event), plus
 *     today/tomorrow day match AND ±60 min window around
 *     scheduledTimeMinutes when set.
 *
 * Data flow unchanged — DiscoverLayer owns `usePartnerData` and passes
 * the resolved arrays through `live`/`scheduled` props.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { X } from 'lucide-react';
import type { LivePartner, ScheduledPartner } from '@/features/parks/core/hooks/usePartnerData';
import UserProfileSheet, { type ProfileUser } from '@/features/parks/client/components/UserProfileSheet';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { usePartnerFilters, type LiveActivityFilter } from '../hooks/usePartnerFilters';
import { useChatStore } from '@/features/social/store/useChatStore';
import { PartnerCard, type PartnerCardActivity } from './PartnerCard';
import { PartnerFilterBar } from './PartnerFilterBar';
import { PartnerFilterSheet } from './PartnerFilterSheet';
import { PartnerEmptyState } from './PartnerEmptyState';
import { useUserStore } from '@/features/user';
import { PROGRAM_NAME_HE } from '@/lib/utils/program-names';

interface PartnerOverlayProps {
  initialTab: 'live' | 'scheduled';
  /** Location is only used to enrich the profile sheet — data is pre-fetched by the host. */
  userLocation: { lat: number; lng: number } | null;
  /** Lifted from `usePartnerData(userLocation, effectiveRadius)` in DiscoverLayer. */
  live: LivePartner[];
  /** Lifted from `usePartnerData(userLocation, effectiveRadius)` in DiscoverLayer. */
  scheduled: ScheduledPartner[];
  /** Lifted from `usePartnerData(userLocation, effectiveRadius)` in DiscoverLayer. */
  isLoading: boolean;
  onClose: () => void;
  onFiltersChange?: (activityFilter: LiveActivityFilter) => void;
}

const ACCENT = '#00ADEF';

// Distance map for the running smart default — covers the literal values
// of `RunProgramTemplate.targetDistance`. 'maintenance' falls back to 5 km
// (typical neighborhood loop) which matches `runDistance` DEFAULTS.
const RUN_TARGET_DISTANCE_KM: Record<string, number> = {
  '2k': 2,
  '3k': 3,
  '5k': 5,
  '10k': 10,
  maintenance: 5,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/**
 * Day-of-week + time-of-day match for scheduled partners.
 *  - `dayBucket === 'all'` → no day filter
 *  - 'today'/'tomorrow' → calendar-day match against `now`
 *  - `timeMinutes !== null` → ±60 min window around the requested HH:MM
 *    (compared independent of date — matches "8am-ish on selected day")
 */
function matchesScheduledTime(
  startTime: Date,
  dayBucket: 'all' | 'today' | 'tomorrow',
  timeMinutes: number | null,
): boolean {
  if (dayBucket !== 'all') {
    const now = new Date();
    if (dayBucket === 'today' && !isSameDay(startTime, now)) return false;
    if (dayBucket === 'tomorrow') {
      const tmrw = new Date(now);
      tmrw.setDate(now.getDate() + 1);
      if (!isSameDay(startTime, tmrw)) return false;
    }
  }
  if (timeMinutes !== null) {
    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    if (Math.abs(startMinutes - timeMinutes) > 60) return false;
  }
  return true;
}

function soloGroupSourceMatches(
  source: ScheduledPartner['source'],
  filter: 'all' | 'solo' | 'groups',
): boolean {
  if (filter === 'all') return true;
  if (filter === 'solo') return source === 'planned' || source === 'event';
  // 'groups' = only real recurring community groups, not per-person event registrations
  return source === 'group';
}

function liveActivityMatches(status: string, filter: LiveActivityFilter): boolean {
  if (filter === 'all') return true;
  // Pass-through for missing/empty status — `LivePartner.activityStatus`
  // defaults to '' in `usePartnerData` (line 456) when a presence doc
  // lacks `activity.status`. This affects:
  //   • Older clients written before the activity field existed.
  //   • Mock/seed presence docs from `seedMockLemurs` / dev simulation.
  //   • The first ~30s of a real workout before `useWorkoutPresence`
  //     fires its first heartbeat.
  // Same conservative policy as the mockPace/programLevel pass-throughs:
  // we'd rather show a partner with missing data than hide them via an
  // unprovable check.
  if (!status) return true;
  // Strength bucket includes legacy / mock 'workout' status alongside the
  // canonical 'strength'. Mirrors the same broadening AppMap applies for
  // marker visibility so cards and pins stay in sync — without this,
  // partners written by older clients (or seeded mocks) show up on the
  // map but disappear from the cards carousel.
  if (filter === 'strength') return status === 'strength' || status === 'workout';
  return status === filter;
}

function isCardActivity(s: string): s is PartnerCardActivity {
  return s === 'strength' || s === 'running' || s === 'walking' || s === 'cycling';
}

// ── Partner card carousel ────────────────────────────────────────────────────
// Drag-and-scale carousel that mirrors the home `WorkoutSelectionCarousel`
// pattern 1:1 — framer-motion drag (NOT native scroll), the active card
// is scaled up to 1.05 while side cards sit at 0.92, both tweened with a
// 300/30 spring. Tapping a side card promotes it to active.
//
// Layout strategy (Option 1 — proven WorkoutSelectionCarousel pattern):
//   - The OUTER viewport stays `dir="rtl"` so the surrounding context
//     (parent flex, scroll behavior) keeps Hebrew RTL semantics.
//   - The INNER motion.div uses `direction: 'ltr'`. In LTR flex, child 0
//     anchors to the container's LEFT edge regardless of how wide the
//     (overflowing) child track is — which is exactly what the trackX
//     math below assumes. Switching the inner track to `direction: 'rtl'`
//     would anchor child 0 to the container's RIGHT edge instead, and
//     the same `trackX = viewportW/2 - trackWidth + …` formula would
//     translate the entire track ~5,000px off-screen to the left
//     (the bug we're fixing here).
//   - To still get Hebrew RTL VISUAL ORDER (data[0] on the right,
//     matching reading order), we REVERSE the children array before
//     rendering. data[i] then sits at DOM position (lastIndex - i) under
//     LTR flex, so data[0] lands at the rightmost slot.
//
// Math (identical to WorkoutSelectionCarousel, just operating on the
// LTR DOM position of the active card instead of its data index):
//     centerX  = (viewportW - cardW) / 2
//     trackX   = centerX - ltrPos * stride          (ltrPos = lastIndex - safeIdx)
//     dragLeft = centerX - lastIndex * stride
//     dragRight = centerX
//
// Constants are intentionally identical to WorkoutSelectionCarousel so
// behavior stays consistent across the two card surfaces.
const CARD_MAX_W = 260;
const CARD_VW = 68;
const CARD_GAP = 12;
const ACTIVE_SCALE = 1.05;
const SIDE_SCALE = 0.92;

interface PartnerCarouselProps {
  /** Stable React keys must be set on each child by the caller. */
  children: React.ReactElement[];
}

function PartnerCarousel({ children }: PartnerCarouselProps) {
  // `activeIndex` is the DATA index of the currently centered card.
  // 0 == children[0] == first data item (visually on the RIGHT after
  // we reverse for LTR layout).
  const [activeIndex, setActiveIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(CARD_MAX_W);
  const [viewportW, setViewportW] = useState(390);

  // Match WorkoutSelectionCarousel — sync to viewport width on mount and
  // whenever the viewport resizes (rotation, keyboard, etc.).
  useEffect(() => {
    const sync = () => {
      setCardW(Math.min(CARD_MAX_W, (window.innerWidth * CARD_VW) / 100));
      if (viewportRef.current) setViewportW(viewportRef.current.offsetWidth);
    };
    sync();
    const ro = new ResizeObserver(sync);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, []);

  const itemCount = children.length;

  // Clamp activeIndex when the underlying list shrinks (filter change,
  // partner drop-off, etc.) so we never animate to an out-of-range slot.
  useEffect(() => {
    if (itemCount > 0 && activeIndex > itemCount - 1) {
      setActiveIndex(itemCount - 1);
    }
  }, [itemCount, activeIndex]);

  const safeIdx = itemCount === 0 ? 0 : Math.min(Math.max(0, activeIndex), itemCount - 1);
  const lastIndex = Math.max(0, itemCount - 1);
  const stride = cardW + CARD_GAP;

  // Children are reversed for RTL visual order, so the active data card
  // (data index `safeIdx`) sits at DOM/LTR position (lastIndex - safeIdx).
  // The math below operates on that LTR position.
  const ltrPos = lastIndex - safeIdx;

  // Identical formula to WorkoutSelectionCarousel.
  const centerX = (viewportW - cardW) / 2;
  const trackX = centerX - ltrPos * stride;
  const dragLeft = centerX - lastIndex * stride;
  const dragRight = centerX;

  const reversedChildren = useMemo(() => children.slice().reverse(), [children]);

  const handleSelect = useCallback(
    (dataIdx: number) => {
      setActiveIndex(Math.max(0, Math.min(itemCount - 1, dataIdx)));
    },
    [itemCount],
  );

  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      // Hebrew RTL convention: the "next" card sits visually to the LEFT
      // of the active one (reading order goes right → left), so a leftward
      // swipe (negative offset) maps to safeIdx + 1, a rightward swipe to
      // safeIdx - 1.
      //
      // Threshold strategy — accept either:
      //   • A meaningful displacement (offset.x past ±30px), OR
      //   • A flick gesture (velocity.x past ±200px/s)
      // Either condition triggers the snap; otherwise the card animates
      // back to centre via the existing spring on `animate={{ x: trackX }}`
      // (no manual snap-back code needed — when we don't change activeIndex,
      // trackX stays the same, so framer-motion springs the dragged track
      // back to its anchored position automatically).
      const offsetX = info.offset.x;
      const velocityX = info.velocity.x;
      if (offsetX < -30 || velocityX < -200) {
        handleSelect(safeIdx + 1);
      } else if (offsetX > 30 || velocityX > 200) {
        handleSelect(safeIdx - 1);
      }
      // else: no-op — spring restores trackX automatically
    },
    [safeIdx, handleSelect],
  );

  return (
    // `pointer-events-auto` here AND on the inner motion.div is intentional.
    // The overlay's outer content layer at `<div className="relative flex flex-col h-full pointer-events-none">`
    // disables events globally so the backdrop button can be tapped through
    // empty space; sections re-enable events with `pointer-events-auto`.
    // CSS inheritance alone is enough for clicks (which bubble up through the
    // child motion.div), but framer-motion's `drag="x"` uses Pointer Events /
    // Pointer Capture on the dragged element directly. When the immediate
    // parent has `overflow-hidden`, omitting an explicit `pointer-events-auto`
    // on the dragged element can cause pointer capture to be released after
    // the first touchmove on some mobile webviews, leaving drag dead while
    // taps still work — exactly the symptom we hit.
    <div ref={viewportRef} dir="rtl" className="overflow-hidden w-full pointer-events-auto">
      <motion.div
        className="flex flex-row items-center pointer-events-auto"
        // direction: 'ltr' on the inner track — see file-top comment.
        // The outer viewport stays dir="rtl"; only this inner flex layer
        // needs LTR for the trackX math to land on the correct pixel.
        style={{ gap: CARD_GAP, paddingTop: 8, direction: 'ltr', touchAction: 'pan-y' }}
        initial={{ x: trackX }}
        animate={{ x: trackX }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        drag="x"
        dragConstraints={{ left: dragLeft, right: dragRight }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
      >
        {reversedChildren.map((child, ltrI) => {
          // ltrI is the DOM/LTR position of this child; map back to the
          // DATA index so active state and tap-to-promote use the same
          // semantics as the rest of the component.
          const dataIdx = lastIndex - ltrI;
          const isActive = dataIdx === safeIdx;
          return (
            <motion.div
              key={(child.key as string | number | null) ?? ltrI}
              className="flex-shrink-0"
              style={{ width: cardW }}
              initial={false}
              animate={{
                scale: isActive ? ACTIVE_SCALE : SIDE_SCALE,
                zIndex: isActive ? 20 : 0,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={() => !isActive && handleSelect(dataIdx)}
            >
              {child}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

/** "5:30" → 330 (sec/km). Returns `null` for unparseable inputs so the
 *  caller can decide whether to skip the filter or fail-closed. */
function parseMockPaceToSeconds(pace: string): number | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(pace.trim());
  if (!m) return null;
  const minutes = Number(m[1]);
  const seconds = Number(m[2]);
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
  return minutes * 60 + seconds;
}

/** "HH:MM" → minutes-from-midnight. Returns `null` if malformed. */
function parseHHMMToMinutes(hhmm: string | undefined | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PartnerOverlay({
  initialTab,
  // userLocation is intentionally accepted but unused in the body — the
  // host (DiscoverLayer) is the sole owner of usePartnerData and passes
  // the resolved arrays through `live`/`scheduled` props. We keep the
  // prop in the API so the overlay can later self-resolve location for
  // the profile sheet (e.g. distance recompute on profile open) without
  // a breaking change.
  userLocation: _userLocation,
  live,
  scheduled,
  isLoading,
  onClose,
  onFiltersChange,
}: PartnerOverlayProps) {
  const [activeTab, setActiveTab] = useState<'live' | 'scheduled'>(initialTab);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [autoSwitchHint, setAutoSwitchHint] = useState<string | null>(null);

  const liveActivity = usePartnerFilters((s) => s.liveActivity);
  const genderFilter = usePartnerFilters((s) => s.genderFilter);
  const soloGroupFilter = usePartnerFilters((s) => s.soloGroupFilter);
  const plannedTime = usePartnerFilters((s) => s.plannedTime);
  const scheduledTimeMinutes = usePartnerFilters((s) => s.scheduledTimeMinutes);
  const levelRange = usePartnerFilters((s) => s.levelRange);
  const paceRange = usePartnerFilters((s) => s.paceRange);
  const selectedProgram = usePartnerFilters((s) => s.selectedProgram);

  // Opening the overlay = explicit user intent to see live partners on
  // the map. Flip the master visibility on. We deliberately do NOT clear
  // it on unmount (`onClose`) so the markers persist across the overlay
  // lifecycle — closing the sheet shouldn't yank the pins the user just
  // asked to see.
  useEffect(() => {
    useMapStore.getState().setLiveUsersVisible(true);
  }, []);

  // ── Smart defaults — apply ONLY when liveActivity === 'all' (fresh) ──
  // Runs once on mount; gated on the activity filter being a "blank
  // slate" so we never overwrite a returning user's manual selections.
  useEffect(() => {
    const filters = usePartnerFilters.getState();
    if (filters.liveActivity !== 'all') return;
    const profile = useUserStore.getState().profile;
    if (!profile) return;

    const running = profile.running;
    const activePrograms = profile.progression?.activePrograms ?? [];
    const domains = profile.progression?.domains ?? {};

    // Priority 1 — running profile
    if (running?.isUnlocked && running.activeProgram) {
      filters.setLiveActivity('running');
      const target = running.generatedProgramTemplate?.targetDistance;
      if (target) {
        const km = RUN_TARGET_DISTANCE_KM[target] ?? 5;
        filters.setRunDistance(km);
      }
      const basePace = running.paceProfile?.basePace;
      if (typeof basePace === 'number' && basePace > 0) {
        const lo = Math.max(180, basePace - 45);
        const hi = Math.min(540, basePace + 45);
        filters.setPaceRange([lo, hi]);
      }
    }
    // Priority 2 — strength profile
    else if (activePrograms.length > 0) {
      const first = activePrograms[0];
      filters.setLiveActivity('strength');
      filters.setSelectedProgram(first.templateId);
      const domainId = first.focusDomains?.[0];
      const domain = domainId ? domains[domainId] : undefined;
      const current = domain?.currentLevel;
      const max = domain?.maxLevel ?? 10;
      if (typeof current === 'number' && current > 0) {
        const lo = Math.max(1, current - 3);
        const hi = Math.min(max, current + 3);
        filters.setLevelRange([lo, hi]);
      }
    }

    // Time slider seed for the scheduled tab — preferred running time
    // first, then strength, then the general training time, fallback 08:00.
    const reminders = profile.lifestyle?.reminders;
    const timeStr =
      reminders?.runningTime ??
      reminders?.strengthTime ??
      profile.lifestyle?.trainingTime ??
      '08:00';
    const timeMin = parseHHMMToMinutes(timeStr);
    if (timeMin !== null) {
      filters.setScheduledTimeMinutes(timeMin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run once on mount only — sets the initial map-marker activity filter
  // from whatever `usePartnerFilters.liveActivity` is at the time the
  // overlay opens. We deliberately drop both `liveActivity` and
  // `onFiltersChange` from the deps array:
  //   - `onFiltersChange` was a fresh function reference on every parent
  //     render, which created an infinite re-render loop.
  //   - Filter changes after mount go through PartnerFilterBar →
  //     `usePartnerFilters` store directly. Components that need to react
  //     to those changes subscribe to the store themselves.
  useEffect(() => {
    onFiltersChange?.(liveActivity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss the Option C hint after 2.5s.
  useEffect(() => {
    if (!autoSwitchHint) return;
    const t = window.setTimeout(() => setAutoSwitchHint(null), 2500);
    return () => window.clearTimeout(t);
  }, [autoSwitchHint]);

  const handleSwitchToScheduled = () => {
    setActiveTab('scheduled');
    setAutoSwitchHint('מציג קבוצות מתוכננות');
  };

  const filteredLive = useMemo<LivePartner[]>(() => {
    // Diagnostic — fires whenever the live data, filter, or any narrowing
    // dimension changes. Lets us inspect why the carousel might be empty
    // when `live.length > 0`. Dev-only; tree-shaken from production builds
    // by Next.js when NODE_ENV === 'production'.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[PartnerOverlay] filteredLive debug:', {
        liveActivity,
        liveLength: live.length,
        partners: live.map((p) => ({
          uid: p.uid,
          activityStatus: p.activityStatus || '(empty)',
          mockPace: p.mockPace ?? null,
          lemurStage: p.lemurStage ?? null,
          programName: p.programName ?? null,
          programLevel: p.programLevel ?? null,
        })),
        levelRange,
        paceRange,
        selectedProgram,
      });
    }
    return live.filter((p) => {
      if (!liveActivityMatches(p.activityStatus, liveActivity)) return false;

      // 'הכל' (all) — show every partner that passed the activity match.
      // We deliberately SKIP every narrowing filter (levelRange / pace /
      // selectedProgram) here because those filter values come from
      // smart-defaults that were calibrated for the user's primary activity
      // (strength program domain or running pace profile). Applying them
      // when the user explicitly asks for "all" silently throws away
      // partners outside that narrow window — the same bug that made
      // tapping [הכל] empty the carousel.
      if (liveActivity === 'all') return true;

      // Strength-only narrowing: program-name match + programLevel range.
      if (liveActivity === 'strength') {
        if (selectedProgram !== null) {
          const wanted = PROGRAM_NAME_HE[selectedProgram] ?? selectedProgram;
          if (p.programName && p.programName !== wanted) return false;
        }
        if (p.programLevel != null) {
          if (p.programLevel < levelRange[0] || p.programLevel > levelRange[1]) return false;
        }
      }
      // Running/walking — apply levelRange against lemurStage (the only
      // "level" signal those activities carry). Partners without a stage
      // pass through.
      else if (p.lemurStage != null) {
        if (p.lemurStage < levelRange[0] || p.lemurStage > levelRange[1]) return false;
      }

      // Pace range — running filter only.
      // Pass-through policy (mirrors `programLevel` above): partners without
      // a `mockPace` value, OR with a `mockPace` we cannot parse, are NOT
      // filtered out. We'd rather show a partner with missing/unparseable
      // pace data than hide them via an unprovable check. This is critical
      // for mock/demo presence docs and for any real partner whose
      // `useWorkoutPresence` heartbeat hasn't yet populated the field
      // (e.g. very first 30s of a run).
      if (liveActivity === 'running' && p.mockPace != null) {
        const sec = parseMockPaceToSeconds(p.mockPace);
        if (sec !== null && (sec < paceRange[0] || sec > paceRange[1])) {
          return false;
        }
      }

      // Note: soloGroupFilter is a no-op on the live tab.
      // [קבוצות] auto-switches to scheduled via Option C (PartnerFilterBar
      // → handleSwitchToScheduled). 'solo' and 'all' both show every live
      // partner since presence is inherently individual.

      // Gender filter — pass-through when the partner has no gender data
      // (minors, legacy presence docs) to avoid incorrectly hiding them.
      if (
        genderFilter !== 'all' &&
        p.gender !== undefined &&
        p.gender !== genderFilter
      ) return false;

      return true;
    });
  }, [live, liveActivity, genderFilter, levelRange, paceRange, selectedProgram]);

  const filteredScheduled = useMemo<ScheduledPartner[]>(() => {
    // plannedTime currently only carries 'all' | 'today' | 'tomorrow'
    // (the 'morning'/'evening' literals were retired with Row 5's slider).
    return scheduled.filter((p) => {
      if (!soloGroupSourceMatches(p.source, soloGroupFilter)) return false;
      if (!matchesScheduledTime(p.startTime, plannedTime, scheduledTimeMinutes)) return false;
      return true;
    });
  }, [scheduled, soloGroupFilter, plannedTime, scheduledTimeMinutes]);

  const liveCount = filteredLive.length;
  const scheduledCount = filteredScheduled.length;

  // ── DEBUG: temporary filter trace ──
  // Logs every change to the strength-filter inputs + a sample of three
  // live partners so we can see exactly which field (programName,
  // programLevel, lemurStage) is breaking the match when [כוח] is
  // selected and the carousel comes up empty.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    console.log('filter debug:', {
      liveActivity,
      selectedProgram,
      levelRange,
      filteredLiveLength: filteredLive.length,
      liveLength: live.length,
      samplePartners: live.slice(0, 3).map((p) => ({
        name: p.name,
        programLevel: p.programLevel,
        programName: p.programName,
        lemurStage: p.lemurStage,
        activityStatus: p.activityStatus,
      })),
    });
  }, [liveActivity, selectedProgram, levelRange, filteredLive, live]);

  const openProfile = (
    uid: string,
    name: string,
    p?: { photoURL?: string | null; personaId?: string | null; lemurStage?: number; activityStatus?: string; workoutTitle?: string },
  ) => {
    setProfileUser({
      uid,
      name,
      photoURL: p?.photoURL ?? undefined,
      personaId: p?.personaId ?? undefined,
      lemurStage: p?.lemurStage,
      activity: p?.activityStatus
        ? { status: p.activityStatus, workoutTitle: p.workoutTitle }
        : undefined,
    });
  };

  // Title + subtitle copy keyed off the active tab.
  const headerCopy = activeTab === 'live'
    ? { title: 'מי מתאמן עכשיו?', subtitle: 'מתאמנים פעילים קרוב אליך כרגע' }
    : { title: 'מי מתכנן להתאמן?', subtitle: 'אימונים מתוכננים היום ומחר באזורך' };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        // Full-screen backdrop at z-[45] — intentionally LOWER than the
        // BottomNavbar (z-50) so the nav renders ON TOP of the overlay
        // and remains visible/tappable. The inner content carries its own
        // 56px bottom padding (the nav's height) so cards never slide
        // behind the nav. z-[45] sits above BottomJourneyContainer (z-40)
        // and below Mapbox facility popups (z-50) — a deliberate slot
        // outside the documented budget for this overlap pattern.
        className="fixed inset-0 z-[45] flex flex-col"
        style={{
          backgroundColor: 'rgba(255,255,255,0.60)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
        dir="rtl"
      >
        {/* Backdrop click area — sits behind the actual content. We use a
            child <button> on the empty top region rather than the whole
            backdrop so the user can interact with cards/filters freely. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          className="absolute inset-0 cursor-default"
          tabIndex={-1}
        />

        <div
          className="relative flex flex-col h-full pointer-events-none"
          // 56px = BottomNavbar height. The overlay covers the full screen
          // (so the white blur extends edge-to-edge), but the inner content
          // box stops 56px short so cards land just above the nav rather
          // than sliding underneath it.
          style={{ paddingBottom: '56px' }}
        >
          {/* ── Close button — absolute, top-right corner. Sits above all
              chrome content so it stays clickable regardless of the row
              layout below. Top offset matches the safe-area + 12px so it
              clears iOS status bar / Android notch. */}
          <button
            type="button"
            onClick={onClose}
            className="absolute w-8 h-8 rounded-full bg-gray-200/80 flex items-center justify-center active:scale-90 transition-transform pointer-events-auto z-10"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', right: 16 }}
            aria-label="סגור"
          >
            <X size={14} className="text-gray-700" />
          </button>

          {/* ── Top chrome block: centered tab pills, then centered title +
              subtitle. Same safe-area padding the previous design used; the
              entire block scrolls together with cards/filter bar below. */}
          <div
            className="pointer-events-auto"
            style={{ paddingTop: 'calc(max(1.5rem, env(safe-area-inset-top, 0px)) + 60px)' }}
          >
            {/* Tab pills — centered as a unit (X is absolute now, so we no
                longer need justify-between to push them apart). */}
            <div className="flex items-center justify-center gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setActiveTab('live')}
                className="flex items-center gap-1.5 rounded-full"
                style={{
                  padding: '6px 16px',
                  fontSize: 14,
                  fontWeight: 500,
                  backgroundColor: activeTab === 'live' ? '#F0F9FF' : 'rgba(0,0,0,0.05)',
                  color: activeTab === 'live' ? '#1a1a1a' : '#6B7280',
                  borderBottom: activeTab === 'live' ? `2px solid ${ACCENT}` : 'none',
                }}
              >
                <span>מי בחוץ</span>
                <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs opacity-70">{liveCount}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('scheduled')}
                className="flex items-center gap-1.5 rounded-full"
                style={{
                  padding: '6px 16px',
                  fontSize: 14,
                  fontWeight: 500,
                  backgroundColor: activeTab === 'scheduled' ? '#F0F9FF' : 'rgba(0,0,0,0.05)',
                  color: activeTab === 'scheduled' ? '#1a1a1a' : '#6B7280',
                  borderBottom: activeTab === 'scheduled' ? `2px solid ${ACCENT}` : 'none',
                }}
              >
                <span>מי מתכנן</span>
                <span aria-hidden>📅</span>
                <span className="text-xs opacity-70">{scheduledCount}</span>
              </button>
            </div>

            {/* Title + subtitle — center-aligned. Title bumped to 26px/800
                weight per redesign; subtitle keeps the previous 13px gray. */}
            <div className="px-4 pt-1 mb-2 text-center">
              <h1
                style={{ fontSize: 26, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.2 }}
              >
                {headerCopy.title}
              </h1>
              <p className="mt-1" style={{ fontSize: 13, color: '#6B7280' }}>
                {headerCopy.subtitle}
              </p>
            </div>

            {/* Option C — transient hint shown after auto-switch. Renders
                between the title block and the filter bar so it doesn't
                push cards down. */}
            <AnimatePresence>
              {autoSwitchHint && (
                <motion.div
                  key="auto-switch-hint"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className="px-4 pb-1"
                >
                  <div
                    className="inline-block rounded-full px-3 py-1"
                    style={{
                      backgroundColor: 'rgba(0,173,239,0.12)',
                      color: ACCENT,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {autoSwitchHint}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Filter bar — sits directly below the top chrome, NOT inside
              the flex-1 cards section. Decoupling it is what lets the cards
              section truly stretch to the bottom of the overlay (just above
              the BottomNavbar) without leaving a white gap underneath.
              `w-full min-w-0 overflow-hidden` is critical: each row inside
              uses `flex-shrink-0` pills + `overflow-x-auto`, but flex items
              default to `min-width: auto` which lets them grow past the
              parent. Without these constraints the rows expanded the
              wrapper off-screen on the right (RTL), and the card list
              below collapsed to 0 width. */}
          <div className="pointer-events-auto mb-2 w-full min-w-0 overflow-hidden">
            <PartnerFilterBar
              tab={activeTab}
              onOpenSheet={() => setFilterSheetOpen(true)}
              onSwitchToScheduled={handleSwitchToScheduled}
            />
          </div>

          {/* ── Cards section — anchored to the BOTTOM of the inner flex
              column via `mt-auto`. The carousel renders at its natural
              intrinsic height (PartnerCard is fixed 330px + 8px paddingTop
              = ~338px) so we never need `flex-1 min-h-0` here. The previous
              `flex-1 min-h-0 flex flex-col justify-end` chain could collapse
              to 0px when the outer `flex flex-col h-full` nesting failed to
              propagate a positive content-box height — which left the
              carousel with `viewportW = 0` after ResizeObserver fired and
              translated the cards thousands of pixels off-screen via the
              RTL `trackX` math. `w-full min-w-0` keeps the carousel from
              ever expanding past the viewport on the cross axis. */}
          <div className="mt-auto w-full min-w-0 pointer-events-auto">
            {isLoading ? (
              <div className="w-full flex flex-col items-center justify-center py-12 text-center">
                <div
                  className="w-8 h-8 border-2 rounded-full animate-spin mb-3"
                  style={{ borderColor: ACCENT, borderTopColor: 'transparent' }}
                />
                <p className="text-xs font-bold" style={{ color: '#1a1a1a' }}>
                  מחפש שותפים...
                </p>
              </div>
            ) : activeTab === 'live' ? (
              filteredLive.length === 0 ? (
                <div className="bg-white/95 backdrop-blur-md mx-4 rounded-2xl">
                  <PartnerEmptyState tab="live" />
                </div>
              ) : (
                <PartnerCarousel>
                  {filteredLive.map((p) => (
                    <PartnerCard
                      key={`live_card_${p.uid}`}
                      type="live"
                      uid={p.uid}
                      name={p.name}
                      photoURL={p.photoURL ?? null}
                      personaId={p.personaId ?? null}
                      lemurStage={p.lemurStage}
                      currentStreak={p.currentStreak}
                      activityStatus={isCardActivity(p.activityStatus) ? p.activityStatus : undefined}
                      workoutTitle={p.workoutTitle}
                      programName={p.programName}
                      programLevel={p.programLevel}
                      mockPace={p.mockPace}
                      distanceKm={p.distanceKm}
                      onAvatarTap={() => openProfile(p.uid, p.name, {
                        photoURL: p.photoURL,
                        personaId: p.personaId,
                        lemurStage: p.lemurStage,
                        activityStatus: p.activityStatus,
                        workoutTitle: p.workoutTitle,
                      })}
                    />
                  ))}
                </PartnerCarousel>
              )
            ) : filteredScheduled.length === 0 ? (
              <div className="bg-white/95 backdrop-blur-md mx-4 rounded-2xl">
                <PartnerEmptyState tab="scheduled" />
              </div>
            ) : (
              <PartnerCarousel>
                {filteredScheduled.map((p) => {
                  // Only recurring community groups get the "group" card style.
                  // Event registrations (source === 'event') are per-person and
                  // render as regular scheduled cards with a DM button instead.
                  const isGroupCard = p.source === 'group';
                  return (
                    <PartnerCard
                      key={`sched_card_${p.id}`}
                      type={isGroupCard ? 'group' : 'scheduled'}
                      uid={p.userId}
                      name={p.displayName}
                      photoURL={p.photoURL}
                      distanceKm={p.distanceKm}
                      startTime={p.startTime}
                      groupName={isGroupCard ? p.sessionLabel : undefined}
                      // No reliable participant count on the group slot
                      // we synthesised in usePartnerData — leave undefined
                      // so the badge renders as the start time instead.
                      memberCount={undefined}
                      onAvatarTap={() => openProfile(p.userId, p.displayName, { photoURL: p.photoURL })}
                      onJoin={isGroupCard ? () => {
                        onClose();
                        useChatStore.getState().openGroup(
                          p.groupId ?? p.id,
                          p.sessionLabel ?? 'קבוצה',
                        );
                      } : undefined}
                    />
                  );
                })}
              </PartnerCarousel>
            )}
          </div>
        </div>
      </motion.div>

      <PartnerFilterSheet
        isOpen={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
      />

      <UserProfileSheet
        isOpen={!!profileUser}
        onClose={() => setProfileUser(null)}
        user={profileUser}
      />
    </>
  );
}

export default PartnerOverlay;
