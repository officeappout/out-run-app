'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  RefreshCw, Lock, ChevronDown, Plus, UserPlus, SlidersHorizontal, Trophy, Info, Check,
  Flame, Activity, Dumbbell, Footprints, MapPin, type LucideIcon,
} from 'lucide-react';
import LeagueFilterSheet from './LeagueFilterSheet';
import { useLeaderboard } from '@/features/arena/hooks/useLeaderboard';
import { useUserStore } from '@/features/user';
import ViralUnlockSheet from '@/features/safecity/components/ViralUnlockSheet';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';
import type {
  LeaderboardScope,
  LeaderboardCategory,
  LeaderboardTimeWindow,
  LeaderboardGenderFilter,
  LeaderboardEntry,
} from '@/features/arena/services/ranking.service';
import type { RunSegmentFilter } from '@/features/arena/services/ranking.service';
import type { LeaderboardMode } from './format-leaderboard-score';
import { CardTile } from '@/components/ui/v2/Card';
import Button from '@/components/ui/v2/Button';
import { BoardCard, BoardIconButton, BoardRow, BoardRowSkeleton } from './LeagueBoard';
import { BoardSheet, ParticipantPeek, HowPointsContent } from './LeagueBoardSheets';
import {
  BOARD_VISIBLE_ROWS,
  splitScore,
  getVisibleRows,
  shouldPinMyRow,
  isSparseBoard,
  computeNextRankTarget,
  formatNextRankLine,
  hasPeriodEnd,
  getPeriodEnd,
  formatTimeLeft,
} from './league-board-logic';

// ── Local types ──────────────────────────────────────────────────────────────

type RunSegment = 'all' | '3k' | '5k' | '10k';
type OpenDropdown = 'cat' | 'sub' | 'gender' | 'time' | null;

// ── Constants ────────────────────────────────────────────────────────────────

const MODE_TO_CATEGORY: Record<LeaderboardMode, LeaderboardCategory> = {
  general: 'overall',
  running: 'cardio',
  strength: 'strength',
  steps: 'overall',
  distance: 'cardio',
};

// מרחק un-hidden (pre-launch backend task) now that getDistanceLeaderboard
// aggregates real summed distanceKm instead of being a stub — see
// ranking.service.ts getDistanceLeaderboard doc comment.
// 16.08.2026 design review: ריצה/כוח don't have a defined leaderboard
// behavior yet — as currently exposed (the real per-segment pace sub-filter
// is hidden, see showSubFilter/Stage A) they rank by activityCredit, a
// synthetic points figure with no real-world unit (see this file's own
// formatLeaderboardScore doc comment), unlike general/steps/distance which
// all rank by a genuine measured quantity. Shown but disabled ("בקרוב")
// rather than removed, so the full intended metric set stays visible.
// Design v2: emoji → lucide icons.
const CATEGORY_OPTIONS: { value: LeaderboardMode; label: string; icon: LucideIcon; comingSoon?: boolean }[] = [
  { value: 'general',  label: 'כללי',   icon: Flame },
  { value: 'running',  label: 'ריצה',   icon: Activity, comingSoon: true },
  { value: 'strength', label: 'כוח',    icon: Dumbbell, comingSoon: true },
  { value: 'steps',    label: 'צעדים',  icon: Footprints },
  { value: 'distance', label: 'מרחק',   icon: MapPin },
];

const RUN_SEGMENT_OPTIONS: { value: RunSegment; label: string }[] = [
  { value: 'all', label: 'כללי'     },
  { value: '3k',  label: '3 ק"מ'   },
  { value: '5k',  label: '5 ק"מ'   },
  { value: '10k', label: '10 ק"מ'  },
];

const TIME_OPTIONS: { value: LeaderboardTimeWindow; label: string }[] = [
  { value: 'daily',   label: 'יומי'   },
  { value: 'weekly',  label: 'שבועי'  },
  { value: 'monthly', label: 'חודשי' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

// formatScore moved to format-leaderboard-score.ts (as formatLeaderboardScore)
// so it's unit-testable without jsx — see that file for the full doc comment.

function getContextLabel(
  mode: LeaderboardMode,
  runSegment: RunSegment,
  strengthProgram: Program | null,
): string {
  switch (mode) {
    case 'general': return 'ימי אימון ברצף';
    case 'steps':   return 'ממוצע יומי שבועי';
    case 'distance': return 'סה"כ ק"מ';
    case 'running':
      if (runSegment === '3k')  return 'שיא קצב ל-3 ק"מ';
      if (runSegment === '5k')  return 'שיא קצב ל-5 ק"מ';
      if (runSegment === '10k') return 'שיא קצב ל-10 ק"מ';
      return 'סה"כ ק"מ שבועי';
    case 'strength':
      return strengthProgram
        ? `רמה ואחוז השלמה — ${strengthProgram.name}`
        : 'רמה ואחוז השלמה';
  }
}

// ── FilterDropdown — module-level component (NOT nested) ─────────────────────
// v2 on the dark board: translucent pills, white when a non-default value is
// set; the menu itself is a light floating tile.

interface FilterDropdownProps {
  label: React.ReactNode;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function FilterDropdown({
  label,
  isActive,
  isOpen,
  onToggle,
  children,
}: FilterDropdownProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`h-8 px-3 rounded-full flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-bold transition-colors ease-v2 ${
          isActive ? 'bg-white text-v2-ink' : 'bg-white/10 text-white'
        }`}
      >
        {label}
        <ChevronDown
          size={14}
          strokeWidth={2.4}
          className="transition-transform ease-v2"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      {isOpen && (
        <div
          className="absolute top-full mt-1.5 bg-white rounded-v2-tile shadow-v2-float z-20 overflow-hidden py-1"
          style={{ minWidth: 160, right: 0 }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ── DropdownItem helper ───────────────────────────────────────────────────────

function DropdownItem({
  isSelected,
  onClick,
  disabled = false,
  trailingLabel,
  children,
}: {
  isSelected: boolean;
  onClick: () => void;
  /** Visible but not selectable — e.g. a metric with no defined leaderboard
   *  behavior yet ("בקרוב"). */
  disabled?: boolean;
  /** Small muted badge on the trailing edge, shown only when disabled. */
  trailingLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-[14px] font-bold transition-colors text-right ${
        disabled ? 'cursor-not-allowed text-v2-muted/60' : isSelected ? 'text-v2-deep' : 'text-v2-ink hover:bg-v2-surface'
      }`}
    >
      <span className="flex-1 flex items-center gap-2">{children}</span>
      {isSelected && !disabled && <Check size={16} strokeWidth={2.6} className="text-v2-deep shrink-0" aria-hidden />}
      {disabled && trailingLabel && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-v2-surface text-v2-muted">
          {trailingLabel}
        </span>
      )}
    </button>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface NeighborhoodLeaderboardProps {
  scope: LeaderboardScope;
  scopeId: string | null;
  scopeLabel?: string;
  isLeagueActive?: boolean;
  isGlobal?: boolean;
  /** Accepted but not currently consumed — reserved for future age-group gating. */
  ageGroup?: 'minor' | 'adult';
  /** Controlled-mode props — when supplied, the component reads/writes the
   *  parent's state instead of its own. Required when multiple sibling
   *  surfaces (e.g. a league carousel) need to share the same filter state. */
  category?: LeaderboardCategory;
  setCategory?: (value: LeaderboardCategory) => void;
  timeWindow?: LeaderboardTimeWindow;
  setTimeWindow?: (value: LeaderboardTimeWindow) => void;
  genderFilter?: LeaderboardGenderFilter;
  setGenderFilter?: (value: LeaderboardGenderFilter) => void;
  /** Bubbles up the current user's entry whenever results change. Used by
   *  the leagues page to show "rank #N" on the active league card. */
  onMyEntryChange?: (entry: LeaderboardEntry | null) => void;
  /** Bubbles up the currently-selected metric mode alongside the entry, so
   *  the page-level sticky "your rank" hero (Stage B) can format the score
   *  with the correct dynamic unit via formatLeaderboardScore instead of a
   *  generic hardcoded label. */
  onMyModeChange?: (mode: LeaderboardMode, isSegmentMode: boolean) => void;
  /**
   * When true, skips the social-viral gate entirely (rows 4+ are never
   * blurred, the "הזמן שותף" overlay never appears). Set to true for
   * cities in 'soft_launch' gating mode so that demo seeder data is
   * visible without requiring a real referral.
   */
  bypassSocialGate?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NeighborhoodLeaderboard({
  scope,
  scopeId,
  scopeLabel,
  isLeagueActive = true,
  isGlobal = false,
  category: categoryProp,
  setCategory: setCategoryProp,
  timeWindow: timeWindowProp,
  setTimeWindow: setTimeWindowProp,
  genderFilter: genderFilterProp,
  setGenderFilter: setGenderFilterProp,
  onMyEntryChange,
  onMyModeChange,
  bypassSocialGate = false,
}: NeighborhoodLeaderboardProps) {
  // ── Controlled-mode fallbacks ────────────────────────────────────────────
  const [internalCategory, setInternalCategory] = useState<LeaderboardCategory>('overall');
  const [internalTimeWindow, setInternalTimeWindow] = useState<LeaderboardTimeWindow>('weekly');
  const [internalGenderFilter, setInternalGenderFilter] = useState<LeaderboardGenderFilter>('all');

  const category     = categoryProp    ?? internalCategory;
  const setCategory  = setCategoryProp ?? setInternalCategory;
  const timeWindow   = timeWindowProp  ?? internalTimeWindow;
  const setTimeWindow  = setTimeWindowProp  ?? setInternalTimeWindow;
  const genderFilter   = genderFilterProp   ?? internalGenderFilter;
  const setGenderFilter = setGenderFilterProp ?? setInternalGenderFilter;

  // ── New filter UI state ──────────────────────────────────────────────────
  const [localMode, setLocalMode]               = useState<LeaderboardMode>('general');
  const [runSegment, setRunSegment]             = useState<RunSegment>('all');
  const [strengthProgramId, setStrengthProgram] = useState<string | null>(null);
  const [programs, setPrograms]                 = useState<Program[]>([]);

  // Load non-master strength programs (only once)
  useEffect(() => {
    let cancelled = false;
    getAllPrograms()
      .then((all) => {
        if (!cancelled) {
          setPrograms(all.filter((p) => !p.isMaster && p.movementPattern != null));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── Category change handler ───────────────────────────────────────────────
  function handleSetMode(mode: LeaderboardMode) {
    setLocalMode(mode);
    setCategory(MODE_TO_CATEGORY[mode]);
    if (mode !== 'running')  setRunSegment('all');
    if (mode !== 'strength') setStrengthProgram(null);
  }

  // ── Leaderboard data ─────────────────────────────────────────────────────
  const getSocialUnlocked = useUserStore((s) => s.getSocialUnlocked);
  const socialUnlocked    = getSocialUnlocked();
  const profile           = useUserStore((s) => s.profile);
  // bypassSocialGate overrides both gates — used for soft_launch cities so
  // seeded demo data is fully visible without a real referral.
  const shouldBlur = !bypassSocialGate && (!isLeagueActive || !socialUnlocked);

  const isSegmentMode = localMode === 'running' && runSegment !== 'all';

  const { entries, myEntry, totalParticipants, isLoading, refresh } = useLeaderboard({
    scope,
    scopeId,
    category,
    timeWindow,
    genderFilter,
    programId: localMode === 'strength' ? strengthProgramId : null,
    dataMode: localMode === 'general'                    ? 'streak'
            : localMode === 'steps'                      ? 'steps'
            : localMode === 'distance'                   ? 'distance'
            : isSegmentMode                              ? 'segment'
            : 'credit',
    runSegment: isSegmentMode ? (runSegment as RunSegmentFilter) : undefined,
  });

  useEffect(() => {
    onMyEntryChange?.(myEntry);
  }, [myEntry, onMyEntryChange]);

  useEffect(() => {
    onMyModeChange?.(localMode, isSegmentMode);
  }, [localMode, isSegmentMode, onMyModeChange]);

  return (
    <NeighborhoodLeaderboardView
      scope={scope}
      scopeLabel={scopeLabel}
      isGlobal={isGlobal}
      entries={entries}
      myEntry={myEntry}
      totalParticipants={totalParticipants}
      isLoading={isLoading}
      onRefresh={refresh}
      localMode={localMode}
      onSetMode={handleSetMode}
      runSegment={runSegment}
      setRunSegment={setRunSegment}
      strengthProgramId={strengthProgramId}
      setStrengthProgram={setStrengthProgram}
      programs={programs}
      timeWindow={timeWindow}
      setTimeWindow={setTimeWindow}
      genderFilter={genderFilter}
      setGenderFilter={setGenderFilter}
      shouldBlur={shouldBlur}
      socialUnlocked={socialUnlocked}
      myStreak={profile?.progression?.currentStreak}
    />
  );
}

// ── Presentational view (hook-free data; UI-only state) ──────────────────────
// Split out of the container above so the board can render with fixture data
// (dev preview route) — same props/data the container already had.

export interface NeighborhoodLeaderboardViewProps {
  scope: LeaderboardScope;
  scopeLabel?: string;
  isGlobal?: boolean;
  entries: LeaderboardEntry[];
  myEntry: LeaderboardEntry | null;
  totalParticipants: number;
  isLoading: boolean;
  onRefresh: () => void;
  localMode: LeaderboardMode;
  onSetMode: (mode: LeaderboardMode) => void;
  runSegment: RunSegment;
  setRunSegment: (v: RunSegment) => void;
  strengthProgramId: string | null;
  setStrengthProgram: (id: string | null) => void;
  programs: Program[];
  timeWindow: LeaderboardTimeWindow;
  setTimeWindow: (value: LeaderboardTimeWindow) => void;
  genderFilter: LeaderboardGenderFilter;
  setGenderFilter: (value: LeaderboardGenderFilter) => void;
  shouldBlur: boolean;
  socialUnlocked: boolean;
  myStreak?: number;
  /** Dev preview only — open the row peek / "how points work" sheet on mount. */
  initialPeekUid?: string;
  initialHowOpen?: boolean;
}

export function NeighborhoodLeaderboardView({
  scope,
  scopeLabel,
  isGlobal = false,
  entries,
  myEntry,
  totalParticipants,
  isLoading,
  onRefresh: refresh,
  localMode,
  onSetMode,
  runSegment,
  setRunSegment,
  strengthProgramId,
  setStrengthProgram,
  programs,
  timeWindow,
  setTimeWindow,
  genderFilter,
  setGenderFilter,
  shouldBlur,
  socialUnlocked,
  myStreak,
  initialPeekUid,
  initialHowOpen = false,
}: NeighborhoodLeaderboardViewProps) {
  const [openDropdown, setOpenDropdown]         = useState<OpenDropdown>(null);
  const [showInvite, setShowInvite]             = useState(false);
  const [filterSheetOpen, setFilterSheetOpen]   = useState(false);
  // v2 UX (UI-only state): visible range + row peek + "how points work".
  const [expanded, setExpanded]                 = useState(false);
  const [peekUid, setPeekUid]                   = useState<string | null>(initialPeekUid ?? null);
  const [howOpen, setHowOpen]                   = useState(initialHowOpen);
  const filterRef = useRef<HTMLDivElement>(null);
  const isSegmentMode = localMode === 'running' && runSegment !== 'all';

  // Click outside collapses any open dropdown
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  function handleSetMode(mode: LeaderboardMode) {
    onSetMode(mode);
    setOpenDropdown(null);
  }

  // ── Hero card (mockup alignment, 16.08.2026) ─────────────────────────────
  // Share/invite use the same lightweight native-share/clipboard mechanism
  // as the page-level sticky "my rank" footer (community/page.tsx), scoped
  // to this leaderboard's own `scopeLabel` instead of the page-level active
  // league card name — same behavior, no cross-component reach-through.
  const heroWindowPhrase = timeWindow === 'daily' ? 'היום' : timeWindow === 'weekly' ? 'השבוע' : 'החודש';

  function handleHeroShare() {
    if (!myEntry) return;
    const name = scopeLabel ?? 'הליגה';
    const text = `אני במקום #${myEntry.rank} ב${name} ${heroWindowPhrase} על Out! 🔥`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text);
  }

  function handleHeroInvite() {
    const name = scopeLabel ?? 'הליגה';
    const text = `בוא תצטרף אליי ב${name} על Out! 🔥`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text);
  }

  // ── Derived filter UI values ─────────────────────────────────────────────
  // Phase 6a: 'distance' ranks feed_posts.distanceKm (getDistanceLeaderboard),
  // and feed_posts docs carry no reserveScope field at all (only
  // streaks/dailyActivity do — see useActivityStore.syncToServer) — every
  // reservist would show an always-empty table, not "nobody's active yet".
  // Hidden outright for this scope (not disabled/"בקרוב" like running/
  // strength) — an option that doesn't exist reads better than one that
  // silently never has data. school/park scopes don't have this problem
  // (feed_posts already carries schoolId/parkId), so this stays scoped to
  // 'reserve' specifically, not a generic capability check.
  const visibleCategoryOptions = scope === 'reserve'
    ? CATEGORY_OPTIONS.filter((o) => o.value !== 'distance')
    : CATEGORY_OPTIONS;
  const activeCatOpt      = visibleCategoryOptions.find((o) => o.value === localMode) ?? visibleCategoryOptions[0];
  const activeStrengthProg = programs.find((p) => p.id === strengthProgramId) ?? null;
  // Stage A (leagues design pass): nav consolidated to exactly two dropdowns
  // (metric + time), per the mockups — the running-segment/strength-program
  // sub-filter dropdown is hidden, not removed. runSegment/strengthProgramId
  // state, handleSetMode, and the JSX below are all still intact and still
  // drive useLeaderboard as before; only the trigger to open this dropdown
  // is hidden. Flip this back to the original condition to re-show it.
  const showSubFilter      = false && (localMode === 'running' || localMode === 'strength');
  const contextLabel       = getContextLabel(localMode, runSegment, activeStrengthProg);

  const catActive    = localMode !== 'general';

  const subActive    = localMode === 'running' ? runSegment !== 'all' : strengthProgramId !== null;
  const genderActive = genderFilter !== 'all';
  const timeActive   = timeWindow !== 'weekly';

  function getSubLabel(): string {
    if (localMode === 'running') {
      const opt = RUN_SEGMENT_OPTIONS.find((o) => o.value === runSegment) ?? RUN_SEGMENT_OPTIONS[0];
      return opt.label;
    }
    if (activeStrengthProg) return activeStrengthProg.name;
    return 'בחר';
  }

  // ── v2 board derivations (pure — league-board-logic.ts) ──────────────────
  const now = new Date();
  const visibleRows = getVisibleRows(entries, expanded);
  const pinMyRow = shouldPinMyRow(visibleRows, myEntry);
  const nextTarget = computeNextRankTarget(entries, myEntry, localMode, isSegmentMode);
  const countdown = hasPeriodEnd(localMode) ? formatTimeLeft(getPeriodEnd(timeWindow, now), now) : null;
  const sparse = isSparseBoard(entries.length);
  const peekEntry = peekUid
    ? entries.find((e) => e.uid === peekUid) ?? (myEntry && myEntry.uid === peekUid ? myEntry : null)
    : null;
  // Social gate: rows from rank 4 down stay blurred until unlocked (unchanged).
  const lockedFromIndex = 3;

  // ONE sticky "you" row (David, 15.10.2026): shown at the bottom of the
  // board only while your real row is off-screen — or not in the visible
  // list at all (below the top-10 cut / past the fetched top-N).
  const myRowRef = useRef<HTMLDivElement>(null);
  const [myRowOnScreen, setMyRowOnScreen] = useState(false);
  useEffect(() => {
    const el = myRowRef.current;
    if (pinMyRow || !el || typeof IntersectionObserver === 'undefined') {
      setMyRowOnScreen(false);
      return;
    }
    // Bottom margin ≈ BottomNavbar + the sticky row itself, so a row hidden
    // behind them counts as off-screen.
    const io = new IntersectionObserver(
      ([e]) => setMyRowOnScreen(e.isIntersecting),
      { rootMargin: '0px 0px -120px 0px', threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pinMyRow, expanded, isLoading, entries]);
  const showStickyMe = !!myEntry && !shouldBlur && !isLoading && (pinMyRow || !myRowOnScreen);

  function renderRow(entry: LeaderboardEntry, blurred = false, sticky = false) {
    const s = splitScore(entry.totalCredit, localMode, isSegmentMode);
    const row = (
      <BoardRow
        key={entry.uid}
        rank={entry.rank}
        name={entry.name}
        nameTag={entry.isCurrentUser ? '(את/ה)' : undefined}
        sub={localMode !== 'general' && localMode !== 'steps' && !isSegmentMode ? `${entry.workoutCount} אימונים` : undefined}
        value={s.value}
        unit={s.unit}
        isMe={entry.isCurrentUser}
        blurred={blurred}
        onClick={() => setPeekUid(entry.uid)}
      />
    );
    if (entry.isCurrentUser && !sticky) {
      return <div key={entry.uid} ref={myRowRef}>{row}</div>;
    }
    return row;
  }

  const ActiveCatIcon = activeCatOpt.icon;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <section dir="rtl">
      <BoardCard
        title={isGlobal ? 'דירוג ארצי' : 'ליגת העיר'}
        subtitle={
          <>
            {scopeLabel ?? 'טבלת דירוג'}
            {countdown && <span className="tabular-nums"> · {countdown}</span>}
          </>
        }
        actions={
          <>
            <BoardIconButton icon={Info} label="איך צוברים נקודות" onClick={() => setHowOpen(true)} />
            <BoardIconButton icon={RefreshCw} label="רענון" onClick={refresh} spinning={isLoading} />
          </>
        }
      >
        {/* ── Filter row ───────────────────────────────────────────── */}
        <div ref={filterRef} className="flex gap-2 flex-wrap items-center">
          {/* קטגוריה — 16.08.2026 design review: a single dropdown (matching
              the Groups tab's "מדד:" dropdown and the time dropdown).
              ריצה/כוח render as disabled "בקרוב" items. */}
          <FilterDropdown
            label={<><ActiveCatIcon size={14} strokeWidth={2.4} aria-hidden />{activeCatOpt.label}</>}
            isActive={catActive}
            isOpen={openDropdown === 'cat'}
            onToggle={() => setOpenDropdown(openDropdown === 'cat' ? null : 'cat')}
          >
            {visibleCategoryOptions.map((opt) => {
              const OptIcon = opt.icon;
              return (
                <DropdownItem
                  key={opt.value}
                  isSelected={localMode === opt.value}
                  onClick={() => handleSetMode(opt.value)}
                  disabled={opt.comingSoon}
                  trailingLabel={opt.comingSoon ? 'בקרוב' : undefined}
                >
                  <OptIcon size={16} strokeWidth={2.4} aria-hidden />
                  {opt.label}
                </DropdownItem>
              );
            })}
          </FilterDropdown>

          {/* Sub-filter (running segments or strength programs) */}
          {showSubFilter && (
            <FilterDropdown
              label={getSubLabel()}
              isActive={subActive}
              isOpen={openDropdown === 'sub'}
              onToggle={() => setOpenDropdown(openDropdown === 'sub' ? null : 'sub')}
            >
              {localMode === 'running' && RUN_SEGMENT_OPTIONS.map((opt) => (
                <DropdownItem
                  key={opt.value}
                  isSelected={runSegment === opt.value}
                  onClick={() => { setRunSegment(opt.value); setOpenDropdown(null); }}
                >
                  {opt.label}
                </DropdownItem>
              ))}

              {localMode === 'strength' && (
                programs.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-v2-muted">טוען תוכניות...</div>
                ) : (
                  programs.map((prog) => (
                    <DropdownItem
                      key={prog.id}
                      isSelected={strengthProgramId === prog.id}
                      onClick={() => { setStrengthProgram(prog.id); setOpenDropdown(null); }}
                    >
                      <Dumbbell size={16} strokeWidth={2.4} aria-hidden />
                      {prog.name}
                    </DropdownItem>
                  ))
                )
              )}
            </FilterDropdown>
          )}

          {/* טווח */}
          <FilterDropdown
            label={(TIME_OPTIONS.find((o) => o.value === timeWindow) ?? TIME_OPTIONS[0]).label}
            isActive={timeActive}
            isOpen={openDropdown === 'time'}
            onToggle={() => setOpenDropdown(openDropdown === 'time' ? null : 'time')}
          >
            {TIME_OPTIONS.map((opt) => (
              <DropdownItem
                key={opt.value}
                isSelected={timeWindow === opt.value}
                onClick={() => { setTimeWindow(opt.value); setOpenDropdown(null); }}
              >
                {opt.label}
              </DropdownItem>
            ))}
          </FilterDropdown>

          {/* פילטרים — opens the secondary-filters sheet (מגדר). */}
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            aria-label="פילטרים"
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ease-v2 ${
              genderActive ? 'bg-white text-v2-ink' : 'bg-white/10 text-white'
            }`}
          >
            <SlidersHorizontal size={14} strokeWidth={2.4} />
          </button>
        </div>

        {/* Context label (+ the old per-row mode badge, once, here) */}
        {contextLabel && (
          <p className="mt-2.5 text-[12px] font-semibold text-white/60 flex items-center gap-1.5">
            {localMode === 'general' && (
              <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-white/10 text-white/80 text-[11px] font-bold">
                <Flame size={11} strokeWidth={2.6} aria-hidden />
                {scope === 'tenant' ? 'ימים פעילים' : 'רצף'}
              </span>
            )}
            {contextLabel}
          </p>
        )}

        {/* Hero — "your position" tile. Metric-first number (never a bare
            label — formatLeaderboardScore), rank pill, streak line,
            distance-to-next-rank, share/invite CTAs. */}
        {!isLoading && myEntry && (
          <CardTile tone="dark" className="mt-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] text-white/60 truncate">
                  המיקום שלך {heroWindowPhrase} · {scopeLabel ?? 'הליגה'}
                </p>
                <p className="mt-1 truncate tabular-nums">
                  <span className="text-[26px] font-black leading-none tracking-v2-tighter text-v2-accent">
                    {splitScore(myEntry.totalCredit, localMode, isSegmentMode).value}
                  </span>
                  <span className="text-[13px] font-bold text-white/70 mr-1">
                    {splitScore(myEntry.totalCredit, localMode, isSegmentMode).unit}
                  </span>
                </p>
              </div>
              <div className="text-center rounded-v2-tile px-3 py-2 shrink-0 bg-white/10">
                <p className="text-[20px] font-black leading-none tabular-nums">#{myEntry.rank}</p>
                <p className="text-[10px] mt-1 text-white/60 tabular-nums">מתוך {totalParticipants}</p>
              </div>
            </div>

            {/* Streak line — 'general' mode's totalCredit IS the real
                currentStreak count (getStreakLeaderboard). No "עוד N לשיא
                שלך" — no longestStreak/bestStreak field exists. */}
            {localMode === 'general' && myEntry.totalCredit > 0 && (
              <p className="mt-2 text-[12px] font-bold text-[#ffd9a8] flex items-center gap-1">
                <Flame size={13} strokeWidth={2.6} fill="currentColor" aria-hidden />
                {myEntry.totalCredit} ימי אימון ברצף
              </p>
            )}

            {/* Distance to the next rank — derived from the row above you
                (league-board-logic.computeNextRankTarget); hidden at #1 or
                when that row wasn't fetched. */}
            {nextTarget && (
              <div className="mt-3">
                <p className="text-[12.5px] font-bold text-white/85 truncate">
                  {formatNextRankLine(nextTarget, localMode)}
                </p>
                <div
                  className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(nextTarget.progress * 100)}
                >
                  <div
                    className="h-full rounded-full bg-v2-cta origin-right"
                    style={{ width: `${Math.max(4, Math.round(nextTarget.progress * 100))}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-3.5">
              <Button variant="primary" size="sm" className="flex-1" onClick={handleHeroShare}>
                שתף את המיקום שלי
              </Button>
              <button
                type="button"
                onClick={handleHeroInvite}
                className="flex-1 h-9 rounded-full inline-flex items-center justify-center gap-1.5 bg-white/10 text-white text-[13px] font-extrabold active:scale-[0.97] transition-transform ease-v2"
              >
                <UserPlus size={14} strokeWidth={2.4} aria-hidden />
                הזמן חברים
              </button>
            </div>
          </CardTile>
        )}

        {/* ── Rows ─────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="grid gap-2 mt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <BoardRowSkeleton key={i} />
            ))}
          </div>
        ) : entries.length === 0 ? (
          // 3-step activation guide — orients the very first user in an empty league
          <div className="mt-4">
            <div className="grid gap-2">
              {[
                { icon: Plus, label: 'אמן כאן את האימון הראשון' },
                { icon: UserPlus, label: 'הזמן שותף לליגה' },
                { icon: Trophy, label: 'פתח את הליגה ותפוס את הפודיום' },
              ].map((step, i) => {
                const StepIcon = step.icon;
                return (
                  <div key={i} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3">
                    <span className="w-[30px] h-[30px] rounded-full bg-white/10 flex items-center justify-center text-[13px] font-black tabular-nums shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-[14px] font-bold">{step.label}</span>
                    <StepIcon size={16} strokeWidth={2.4} className="text-v2-accent" aria-hidden />
                  </div>
                );
              })}
            </div>
            <p className="text-[13px] text-white/70 text-center mt-4 leading-relaxed">
              היו הראשונים בליגה! הזמינו חברים והתחילו להתאמן כדי לתפוס את הפודיום
            </p>
            <div className="flex justify-center mt-3">
              <Button variant="primary" size="md" onClick={() => setShowInvite(true)}>
                <UserPlus size={16} strokeWidth={2.4} aria-hidden />
                הזמן חברים לליגה
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-2 mt-4">
              {visibleRows.slice(0, lockedFromIndex).map((e) => renderRow(e))}
            </div>

            {visibleRows.length > lockedFromIndex && (
              <div className="relative">
                <div className="grid gap-2 mt-2">
                  {visibleRows.slice(lockedFromIndex).map((e) => renderRow(e, shouldBlur))}
                </div>

                {shouldBlur && (
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-v2-ink via-v2-ink/90 to-transparent flex flex-col items-center justify-center px-5 text-center">
                    <Lock size={20} strokeWidth={2.4} className="text-v2-accent mb-2" aria-hidden />
                    <p className="text-[15px] font-black">הטבלה נעולה</p>
                    <p className="text-[12.5px] text-white/70 mt-1 mb-3 max-w-[240px]">
                      {!socialUnlocked
                        ? 'הזמן שותף אחד כדי לפתוח את הטבלה המלאה'
                        : 'לחץ על העירייה כדי לפתוח את הליגה הרשמית'}
                    </p>
                    {!socialUnlocked && (
                      <Button variant="primary" size="sm" onClick={() => setShowInvite(true)}>
                        <UserPlus size={14} strokeWidth={2.4} aria-hidden />
                        הזמן שותף
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* The single sticky "you" row — sticks just above the
                BottomNavbar (46px + safe area, same offset the old page
                bar used) while your real row is off-screen, and rests at
                the bottom of the board when the board ends. Opaque ink
                backing so rows scrolling under it don't show through. */}
            {showStickyMe && myEntry && (
              <div
                data-board-sticky-me
                className="sticky z-10 -mx-2 mt-2 rounded-[20px] bg-v2-ink p-2 shadow-v2-card-dark"
                style={{ bottom: 'calc(54px + env(safe-area-inset-bottom, 0px))' }}
              >
                {renderRow(myEntry, false, true)}
              </div>
            )}

            {entries.length > BOARD_VISIBLE_ROWS && !shouldBlur && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 w-full h-10 rounded-full bg-white/[0.06] text-[13px] font-extrabold text-white/85 flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform ease-v2"
              >
                {expanded ? 'הצג פחות' : `הצג את כל ${entries.length} המשתתפים`}
                <ChevronDown
                  size={15}
                  strokeWidth={2.4}
                  className="transition-transform ease-v2"
                  style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
                  aria-hidden
                />
              </button>
            )}

            {/* Sparse board → invite/encourage instead of a near-empty table.
                Reuses the existing invite sheet (ViralUnlockSheet). */}
            {sparse && (
              <div className="mt-3 rounded-2xl border border-dashed border-white/20 px-4 py-4 flex items-center gap-3">
                <span className="w-[42px] h-[42px] rounded-[14px] bg-white/10 flex items-center justify-center text-v2-accent shrink-0">
                  <UserPlus size={20} strokeWidth={2.4} aria-hidden />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-black">הליגה רק מתחילה</p>
                  <p className="text-[12.5px] text-white/70 leading-snug mt-0.5">
                    {entries.length === 1 ? 'יש כאן משתתף אחד בלבד' : `יש כאן רק ${entries.length} משתתפים`} — הזמינו חברים כדי שיהיה עם מי להתחרות
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={() => setShowInvite(true)} aria-label="הזמן חברים לליגה">
                  הזמן
                </Button>
              </div>
            )}
          </>
        )}
      </BoardCard>

      {/* Invite sheet — opened by the sparse card, the locked-table CTA, the
          peek sheet and the empty-state button. */}
      <ViralUnlockSheet isOpen={showInvite} onClose={() => setShowInvite(false)} />

      <LeagueFilterSheet
        isOpen={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        genderFilter={genderFilter}
        onGenderFilterChange={setGenderFilter}
      />

      <BoardSheet isOpen={!!peekEntry} onClose={() => setPeekUid(null)} title="פרטי המשתתף">
        {peekEntry && (
          <ParticipantPeek
            entry={peekEntry}
            myEntry={myEntry}
            totalParticipants={totalParticipants}
            mode={localMode}
            isSegmentMode={isSegmentMode}
            myStreak={myStreak}
            onInvite={() => { setPeekUid(null); setShowInvite(true); }}
          />
        )}
      </BoardSheet>

      <BoardSheet isOpen={howOpen} onClose={() => setHowOpen(false)} title="איך צוברים נקודות">
        <HowPointsContent isTenant={scope === 'tenant'} />
      </BoardSheet>

      {/* Personal "you" rank card — rendered by the parent (community/page.tsx)
          as a shared sticky footer. Not duplicated here. */}
    </section>
  );
}
