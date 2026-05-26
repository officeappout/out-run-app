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
 *     today/tomorrow day match AND scheduledTimeRange window.
 *
 * Data flow unchanged — DiscoverLayer owns `usePartnerData` and passes
 * the resolved arrays through `live`/`scheduled` props.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
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
import { useSuppressBottomNav } from '@/features/parks/core/hooks/useSuppressBottomNav';

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
 *  - `timeRange` is applied only when a day bucket is selected —
 *    it checks that the session starts within [rangeMin, rangeMax].
 */
function matchesScheduledTime(
  startTime: Date,
  dayBucket: 'all' | 'today' | 'tomorrow',
  timeRange: [number, number],
): boolean {
  if (dayBucket !== 'all') {
    const now = new Date();
    if (dayBucket === 'today' && !isSameDay(startTime, now)) return false;
    if (dayBucket === 'tomorrow') {
      const tmrw = new Date(now);
      tmrw.setDate(now.getDate() + 1);
      if (!isSameDay(startTime, tmrw)) return false;
    }
    // Apply time-of-day range filter only when a day bucket is active.
    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    if (startMinutes < timeRange[0] || startMinutes > timeRange[1]) return false;
  }
  return true;
}

function soloGroupSourceMatches(
  source: ScheduledPartner['source'],
  filter: 'all' | 'solo' | 'groups',
): boolean {
  // The current user's own arrival (`source === 'ownArrival'`) is
  // ALWAYS visible regardless of solo/groups filter — the user needs
  // to see their own announcement to confirm it persisted, and that
  // signal shouldn't get hidden behind a filter pill.
  if (source === 'ownArrival') return true;
  if (filter === 'all') return true;
  if (filter === 'solo') return source === 'planned' || source === 'event';
  // 'groups' = only real recurring community groups, not per-person event registrations
  return source === 'group';
}

function liveActivityMatches(status: string, filter: LiveActivityFilter): boolean {
  if (filter === 'all') return true;
  // Idle-partner policy: a partner whose presence doc has no activity
  // block (activityStatus === '' or undefined — heartbeat-only presence,
  // no active workout) passes the STRENGTH filter but is rejected by
  // every cardio filter (running, walking, cycling).
  //
  // Rationale: strength-profile users appear in the partner finder even
  // when they are not mid-workout (they may be at the park, warming up,
  // or in rest between sets). Their presence is still meaningful context
  // for a strength partner seeker, so hiding them behind a "workout"
  // status requirement causes filteredLiveLength === 0 for any user
  // whose liveActivity was smart-defaulted to 'strength'.
  //
  // Cardio filters (running / walking / cycling) remain strict — an idle
  // presence with no declared pace/route doesn't help a runner choose
  // a training buddy, and the old pass-through here caused "ריצה shows
  // the same N partners as הכל" because every idle heartbeat slipped
  // through.
  if (!status) return filter === 'strength';
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
// Native scroll-snap carousel — copied from `RouteCarousel.CardsState` so
// the partner-finder cards behave EXACTLY like the route cards: a fast
// flick can never blow past one card and land on the next-next, and the
// browser HAS to settle on each card. We delegate snap math to the
// browser instead of running our own framer-motion drag formula, which
// was the root cause of the "stops mid-way between cards" complaint —
// the previous PanInfo threshold (30px or 200px/s velocity) advanced
// only one slot at a time and left ambiguous gestures parked between
// snap points.
//
// Pattern (mirrors RouteCarousel):
//   • Outer container: `dir="ltr"` + `flex-row-reverse` — so children[0]
//     sits as the rightmost DOM child (RTL VISUAL order) while keeping
//     normal LTR scroll math. We rely on the browser's automatic
//     scroll-snap behaviour; no manual `trackX` math.
//   • Each card slot: `snap-center snap-always flex-shrink-0` so
//     `scroll-snap-stop: always` prevents the browser from leapfrogging
//     a card on a fast flick. This is the contract that fixes the
//     "stops mid-way between cards" bug — the user-visible counterpart
//     to the same issue documented at length in RouteCarousel.tsx.
//   • `findCenteredIndex` reads each card's actual `offsetLeft` (NOT a
//     derived `containerWidth × 0.85` formula) so the active-card scale
//     boost stays aligned with the snap target across viewport sizes.
//
// Card sizing constants are identical to the previous (framer-motion)
// implementation so the visual rhythm — width, gap, active-scale,
// side-scale — stays bit-identical for users coming from the old build.
const CARD_VW = 68;
const CARD_MAX_W = 260;

interface PartnerCarouselProps {
  /** Stable React keys must be set on each child by the caller. */
  children: React.ReactElement[];
}

function PartnerCarousel({ children }: PartnerCarouselProps) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemCount = children.length;

  // Inject scrollbar-hide style once per app lifetime. Idempotent — the
  // RouteCarousel injects the same rule, so re-injecting here is safe
  // (`appendChild` of a duplicate `<style>` produces an extra rule
  // without affecting computed styles). We could de-dupe by id but the
  // overhead is sub-microsecond and not worth the extra branching.
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent =
      '.partner-scrollbar-hide::-webkit-scrollbar{display:none}.partner-scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}';
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Helper: which card is currently centered? Reads each card's actual
  // `offsetLeft` from the DOM rather than a derived formula. Robust to
  // viewport-clamped widths (the `max-w-[260px]` clip on tablet-width
  // viewports made the old derived formula skip cards).
  const findCenteredIndex = useCallback((): number => {
    const container = carouselRef.current;
    if (!container) return -1;
    const cards = Array.from(container.children) as HTMLElement[];
    if (cards.length === 0) return -1;
    const containerCenter = container.scrollLeft + container.offsetWidth / 2;
    let closestIdx = 0;
    let minDist = Infinity;
    cards.forEach((card, i) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - containerCenter);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    });
    return closestIdx;
  }, []);

  // Initial scroll — first child centered (visually on the RIGHT under
  // RTL `flex-row-reverse`). useLayoutEffect prevents a left-to-right
  // flash on first paint. Re-runs when itemCount changes (filter swap,
  // partner drop-off) so the carousel always anchors back to the head
  // of the list rather than drifting off the end.
  useLayoutEffect(() => {
    const container = carouselRef.current;
    if (!container || itemCount === 0) return;
    const target = container.children[0] as HTMLElement | undefined;
    if (!target) return;
    container.scrollLeft =
      target.offsetLeft + target.offsetWidth / 2 - container.offsetWidth / 2;
    setActiveIndex(0);
  }, [itemCount]);

  const handleScroll = useCallback(() => {
    const idx = findCenteredIndex();
    if (idx < 0) return;
    if (idx !== activeIndex) {
      setActiveIndex(idx);
    }
  }, [activeIndex, findCenteredIndex]);

  return (
    // `pointer-events-auto` is required because the overlay's outer
    // content layer is `pointer-events-none` (so the backdrop tap area
    // works through empty space) and individual sections re-enable
    // events here. Without it, native scroll wouldn't receive any
    // pointer events and the cards would feel frozen.
    <div
      ref={carouselRef}
      dir="ltr"
      onScroll={handleScroll}
      className="w-full overflow-x-auto snap-x snap-mandatory flex flex-row-reverse gap-3 pb-3 pt-2 partner-scrollbar-hide pointer-events-auto"
      style={{
        paddingInlineStart: '16px',
        paddingInlineEnd: '40px',
        scrollBehavior: 'smooth',
      }}
    >
      {children.map((child, idx) => {
        const isActive = idx === activeIndex;
        return (
          <div
            key={(child.key as string | number | null) ?? idx}
            // `snap-center snap-always` = scroll-snap-stop: always. The
            // browser MAY NOT skip past this card on a fast flick — it
            // has to stop here even if the user's gesture momentum
            // would carry them further. Without `snap-always`,
            // snap-mandatory still allows leapfrogging when scroll
            // velocity is high.
            className={`snap-center snap-always flex-shrink-0 transition-transform duration-300 ${
              isActive ? 'scale-[1.02] opacity-100' : 'scale-[0.96] opacity-90'
            }`}
            style={{
              width: `min(${CARD_VW}vw, ${CARD_MAX_W}px)`,
            }}
          >
            {child}
          </div>
        );
      })}
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
  const ageRange = usePartnerFilters((s) => s.ageRange);
  const soloGroupFilter = usePartnerFilters((s) => s.soloGroupFilter);
  const plannedTime = usePartnerFilters((s) => s.plannedTime);
  const scheduledTimeRange = usePartnerFilters((s) => s.scheduledTimeRange);
  const levelRange = usePartnerFilters((s) => s.levelRange);
  const paceRange = usePartnerFilters((s) => s.paceRange);
  const selectedProgram = usePartnerFilters((s) => s.selectedProgram);

  // Suppress the global BottomNavbar for the full Partner Hub session.
  // The nav slides off-screen via its `isSuppressed` animation and its
  // pointer-events are disabled, so tapping the bottom area of the overlay
  // can never accidentally trigger a tab switch. The hook auto-releases on
  // unmount so the bar returns the moment the overlay is closed.
  useSuppressBottomNav();

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

      // Solo / group narrowing — orthogonal to activity, so this runs
      // BEFORE the `liveActivity === 'all'` early-return below. The
      // signal is `LivePartner.groupSessionId` (mirrored from the
      // presence doc's `groupSessionId` field, which `useGroupPresence`
      // also consumes). Empty / undefined means the partner is training
      // solo right now; a non-empty session id means they're in a
      // shared group session.
      if (soloGroupFilter === 'solo' && p.groupSessionId) return false;
      if (soloGroupFilter === 'groups' && !p.groupSessionId) return false;

      // 'הכל' (all) — show every partner that passed the activity +
      // solo/group filters. We deliberately SKIP every remaining
      // narrowing filter (levelRange / pace / selectedProgram) here
      // because those filter values come from smart-defaults that were
      // calibrated for the user's primary activity (strength program
      // domain or running pace profile). Applying them when the user
      // explicitly asks for "all" silently throws away partners outside
      // that narrow window — the same bug that made tapping [הכל]
      // empty the carousel.
      if (liveActivity === 'all') return true;

      // Strength-only narrowing: program pill match + level range.
      // Level range is STRENGTH-ONLY now — running / walking are
      // filtered exclusively by distance + pace per the cardio spec
      // ("level is irrelevant for cardio").
      if (liveActivity === 'strength') {
        // Program filter: compare the slug stored in `p.programId`
        // (written by useWorkoutPresence as `activeProgram.templateId`)
        // directly against `selectedProgram` (also a templateId slug).
        // This replaces the previous Hebrew-label comparison which
        // converted selectedProgram via PROGRAM_NAME_HE and compared
        // against `p.programName` — those two formats never matched
        // ('upper body' !== 'פלג גוף עליון'), silently hiding every
        // partner whenever a program pill was active.
        if (selectedProgram !== null) {
          if (p.programId !== undefined && p.programId !== selectedProgram) return false;
        }
        // Prefer `programLevel` when present (per-program domain level,
        // e.g. push-up program 1-12); fall back to `lemurStage` so idle
        // strength partners with only the heartbeat lemur stage still
        // narrow correctly. Pass-through when neither is set so we
        // don't hide partners on legacy / mock presence docs that
        // haven't yet filled the level fields.
        const partnerLevel = p.programLevel ?? p.lemurStage ?? null;
        if (
          partnerLevel != null &&
          (partnerLevel < levelRange[0] || partnerLevel > levelRange[1])
        ) {
          return false;
        }
      }

      // Pace range — running filter only.
      // Pass-through policy (mirrors the level pass-through above): partners
      // without a `mockPace` value, OR with a `mockPace` we cannot parse,
      // are NOT filtered out. We'd rather show a partner with missing/
      // unparseable pace data than hide them via an unprovable check.
      // This is critical for mock/demo presence docs and for any real
      // partner whose `useWorkoutPresence` heartbeat hasn't yet
      // populated the field (e.g. very first 30s of a run).
      if (liveActivity === 'running' && p.mockPace != null) {
        const sec = parseMockPaceToSeconds(p.mockPace);
        if (sec !== null && (sec < paceRange[0] || sec > paceRange[1])) {
          return false;
        }
      }

      // Gender filter — pass-through when the partner has no gender data
      // (minors, legacy presence docs) to avoid incorrectly hiding them.
      if (
        genderFilter !== 'all' &&
        p.gender !== undefined &&
        p.gender !== genderFilter
      ) return false;

      // Age-group filter — presence docs only carry 'minor' | 'adult'.
      // We cannot distinguish ages within the adult bracket (privacy),
      // so adults always pass. Minors are excluded when the lower
      // bound of the selected range is ≥ 18 (i.e., the user explicitly
      // asked for adults-only). Pass-through when ageGroup is missing
      // (legacy docs) to avoid incorrectly hiding those partners.
      if (p.ageGroup === 'minor' && ageRange[0] >= 18) return false;

      return true;
    });
  }, [live, liveActivity, genderFilter, ageRange, soloGroupFilter, levelRange, paceRange, selectedProgram]);

  const filteredScheduled = useMemo<ScheduledPartner[]>(() => {
    // plannedTime currently only carries 'all' | 'today' | 'tomorrow'
    // (the 'morning'/'evening' literals were retired with Row 5's slider).
    return scheduled.filter((p) => {
      if (!soloGroupSourceMatches(p.source, soloGroupFilter)) return false;
      if (!matchesScheduledTime(p.startTime, plannedTime, scheduledTimeRange)) return false;
      return true;
    });
  }, [scheduled, soloGroupFilter, plannedTime, scheduledTimeRange]);

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

  // ── Internal chat connect handler factory ────────────────────────────────
  // Browsing-loop design: the PartnerOverlay stays fully mounted (scroll
  // position, active tab, filters all preserved) while the ChatInbox sheet
  // slides up at z-[101] — above this overlay's z-[90] armor. Dismissing
  // the chat simply unmounts the sheet and drops the user straight back
  // into their partner search context without any re-render or state reset.
  //
  // NOTE: onClose() is intentionally NOT called here. The previous pattern
  // of closing the overlay before opening chat caused the z-index collision;
  // the fix is to keep both layers mounted and rely on the chat layer's
  // higher z-index to cover the overlay visually.
  const makeConnectHandler = useCallback(
    (partnerUid: string, partnerName: string) => () => {
      const profile = useUserStore.getState().profile;
      if (!profile?.id) return;
      void useChatStore.getState().openDM(
        profile.id,
        profile.core?.name ?? 'אווטיר',
        partnerUid,
        partnerName,
      );
    },
    [],
  );

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
        // Full-screen overlay at z-[90] — above BottomNavbar (z-50) and
        // ChatInbox (z-70). The nav is also suppressed via useSuppressBottomNav
        // so it animates off-screen; the high z-index is a belt-and-braces
        // guarantee that no tab bar chrome bleeds through on any device.
        //
        // Backdrop dead-space tap-to-close: we rely on the browser's event
        // model rather than a full-coverage <button>. The inner content
        // layer is `pointer-events-none`; interactive sections re-enable
        // it via `pointer-events-auto`. Clicking truly empty space fires
        // the event directly on THIS motion.div, so
        // `e.target === e.currentTarget` is true and `onClose` fires.
        // Clicking any real interactive child produces
        // `e.target !== e.currentTarget` so the close is NOT triggered —
        // card scrolls, filter pills, avatar taps, etc. are all safe.
        className="fixed inset-0 z-[90] flex flex-col"
        style={{
          backgroundColor: 'rgba(255,255,255,0.60)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
        dir="rtl"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="relative flex flex-col h-full pointer-events-none"
          // Bottom padding = device safe-area only. The BottomNavbar is now
          // suppressed (useSuppressBottomNav), so we no longer need the
          // previous 56px hard-coded clearance for the nav bar height.
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {/* ── Back button — top-LEFT corner (visual left = RTL "end" position).
              Native Hebrew apps place the back chevron on the visual left
              side of the header, pointing left (←), matching iOS/Android RTL
              conventions. ChevronLeft renders as ← which reads as "back" in
              both LTR and RTL mental models. */}
          <button
            type="button"
            onClick={onClose}
            className="absolute w-9 h-9 rounded-full bg-gray-200/80 flex items-center justify-center active:scale-90 transition-transform pointer-events-auto z-10"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 16 }}
            aria-label="חזור"
          >
            <ChevronLeft size={18} className="text-gray-700" />
          </button>

          {/* ── Top chrome block: centered tab pills, then centered title +
              subtitle. paddingTop is tightened to +36px (was +60px) now that
              the back button is the only absolute chrome in the corner —
              no second X button means we can reclaim that vertical real estate
              and pull the cards carousel up closer to the filters. */}
          <div
            className="pointer-events-auto"
            style={{ paddingTop: 'calc(max(1.5rem, env(safe-area-inset-top, 0px)) + 36px)' }}
          >
            {/* Tab pills — centered as a unit. py tightened from py-3 to
                py-1.5 to close the vertical gap between the back button and
                the title/cards below. */}
            <div className="flex items-center justify-center gap-2 px-4 py-1.5">
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

          {/* ── Cards section — sits directly below the filter bar with a
              small mt-3 gap (was mt-auto which pushed the carousel all the
              way to the bottom edge, creating a large empty dead-space band
              between the filters and the cards on every device taller than
              ~600px). mt-3 keeps the carousel close to the filters while
              `w-full min-w-0` prevents RTL overflow. The carousel's fixed
              intrinsic height (330px card + padding) means it won't collapse
              to 0 — the previous collapse risk only occurred with flex-1/
              min-h-0 chains, not with natural-height content like this. */}
          <div className="mt-3 w-full min-w-0 pointer-events-auto">
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
                      onConnect={makeConnectHandler(p.uid, p.name)}
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
                  // The user's own arrival surfaces as a regular
                  // `'scheduled'` card with the `isSelf` flag set, which
                  // swaps the top-start stage pill for a "הגעה שלי" badge.
                  // We also suppress profile-tap (no point opening your own
                  // profile sheet from here) and DM/join CTAs.
                  const isOwn = p.source === 'ownArrival';
                  // Park arrivals carry `parkName`; route arrivals carry
                  // `routeName`. The card renders a 📍 line via the unified
                  // `locationLabel` prop — consumers don't care WHICH of
                  // the two is set, only that there's a place to label.
                  // Group cards put the session label in the TITLE
                  // (`groupName`), so we deliberately leave `locationLabel`
                  // undefined for them to avoid a redundant second copy
                  // of the same name.
                  const locationLabel = !isGroupCard
                    ? p.parkName ?? p.routeName ?? undefined
                    : undefined;
                  return (
                    <PartnerCard
                      key={`sched_card_${p.id}`}
                      type={isGroupCard ? 'group' : 'scheduled'}
                      uid={p.userId}
                      name={p.displayName}
                      photoURL={p.photoURL}
                      distanceKm={p.distanceKm}
                      startTime={p.startTime}
                      endTime={p.endTime}
                      programName={p.programName}
                      programLevel={p.programLevel}
                      locationLabel={locationLabel}
                      groupName={isGroupCard ? p.sessionLabel : undefined}
                      // No reliable participant count on the group slot
                      // we synthesised in usePartnerData — leave undefined
                      // so the badge renders as the start time instead.
                      memberCount={undefined}
                      isSelf={isOwn}
                      onAvatarTap={isOwn ? undefined : () => openProfile(p.userId, p.displayName, { photoURL: p.photoURL })}
                      onConnect={!isGroupCard && !isOwn ? makeConnectHandler(p.userId, p.displayName) : undefined}
                      onJoin={isGroupCard ? () => {
                        // Keep overlay mounted — chat slides up at z-[101]
                        void useChatStore.getState().openGroup(
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
