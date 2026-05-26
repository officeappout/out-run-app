'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Trophy, RefreshCw, Lock, Medal, Flame, ChevronDown } from 'lucide-react';
import { useLeaderboard } from '@/features/arena/hooks/useLeaderboard';
import { useUserStore } from '@/features/user';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';
import {
  formatPaceSecPerKm,
} from '@/features/arena/services/ranking.service';
import type {
  LeaderboardScope,
  LeaderboardCategory,
  LeaderboardTimeWindow,
  LeaderboardGenderFilter,
  LeaderboardEntry,
} from '@/features/arena/services/ranking.service';
import type { RunSegmentFilter } from '@/features/arena/services/ranking.service';

// ── Local types ──────────────────────────────────────────────────────────────

type LeaderboardMode = 'general' | 'running' | 'strength' | 'steps';
type RunSegment = 'all' | '3k' | '5k' | '10k';
type OpenDropdown = 'cat' | 'sub' | 'gender' | 'time' | null;

// ── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#1D9E75';

const MODE_TO_CATEGORY: Record<LeaderboardMode, LeaderboardCategory> = {
  general: 'overall',
  running: 'cardio',
  strength: 'strength',
  steps: 'overall',
};

const CATEGORY_OPTIONS: { value: LeaderboardMode; label: string; emoji: string }[] = [
  { value: 'general',  label: 'כללי',   emoji: '🔥' },
  { value: 'running',  label: 'ריצה',   emoji: '🏃' },
  { value: 'strength', label: 'כוח',    emoji: '💪' },
  { value: 'steps',    label: 'צעדים',  emoji: '👟' },
];

const RUN_SEGMENT_OPTIONS: { value: RunSegment; label: string; emoji: string }[] = [
  { value: 'all', label: 'כללי',     emoji: '🏃' },
  { value: '3k',  label: '3 ק"מ',   emoji: '⚡' },
  { value: '5k',  label: '5 ק"מ',   emoji: '⚡' },
  { value: '10k', label: '10 ק"מ',  emoji: '⚡' },
];

const GENDER_OPTIONS: { value: LeaderboardGenderFilter; label: string }[] = [
  { value: 'all',    label: 'הכל'   },
  { value: 'male',   label: 'גברים' },
  { value: 'female', label: 'נשים'  },
];

const TIME_OPTIONS: { value: LeaderboardTimeWindow; label: string }[] = [
  { value: 'weekly',  label: 'שבועי'  },
  { value: 'monthly', label: 'חודשי' },
];

const PODIUM_STYLES = [
  { ring: 'ring-amber-400',  bg: 'bg-gradient-to-br from-amber-400 to-yellow-500', shadow: 'shadow-amber-400/30',  size: 'w-14 h-14', medal: '🥇' },
  { ring: 'ring-gray-300',   bg: 'bg-gradient-to-br from-gray-300 to-slate-400',   shadow: 'shadow-gray-300/30',   size: 'w-11 h-11', medal: '🥈' },
  { ring: 'ring-amber-600',  bg: 'bg-gradient-to-br from-amber-600 to-orange-700', shadow: 'shadow-amber-600/20',  size: 'w-11 h-11', medal: '🥉' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** `isSegmentMode` is true when running sub-filter is a specific segment (not 'all'). */
function formatScore(value: number, mode: LeaderboardMode, isSegmentMode?: boolean): string {
  if (mode === 'general') return `${value} ימים`;
  if (mode === 'steps')   return `${value.toLocaleString('he-IL')} צעדים`;
  if (mode === 'running' && isSegmentMode) {
    // value is paceSecPerKm — display as "MM:SS /ק״מ"
    return value > 0 ? `${formatPaceSecPerKm(value)} /ק״מ` : '—';
  }
  return value.toLocaleString('he-IL');
}

function getContextLabel(
  mode: LeaderboardMode,
  runSegment: RunSegment,
  strengthProgram: Program | null,
): string {
  switch (mode) {
    case 'general': return 'ימי אימון ברצף';
    case 'steps':   return 'ממוצע יומי שבועי';
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

// Map an iconKey to a simple emoji fallback for the strength-programs dropdown.
// When the full SVG icon system is wired up here, replace this lookup.
const ICON_KEY_TO_EMOJI: Record<string, string> = {
  muscle: '💪', pullup: '🏋️', leg: '🦵', legs: '🦵', core: '🔥',
  run: '🏃', shoe: '👟', full_body: '⭐', upper_body: '💪',
  push: '🤜', pull: '🏋️',
};
function iconKeyEmoji(iconKey?: string | null): string {
  if (!iconKey) return '💪';
  return ICON_KEY_TO_EMOJI[iconKey.toLowerCase()] ?? '💪';
}

// ── FilterDropdown — module-level component (NOT nested) ─────────────────────

interface FilterDropdownProps {
  label: string;
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
        className="flex items-center gap-1 transition-colors whitespace-nowrap"
        style={{
          padding: '6px 10px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 500,
          border: isActive ? `1px solid ${ACCENT}` : '0.5px solid #D1D5DB',
          backgroundColor: isActive ? '#E1F5EE' : '#FFFFFF',
          color: isActive ? '#0F6E56' : '#374151',
        }}
      >
        {label}
        <ChevronDown
          className="w-3 h-3 transition-transform"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      {isOpen && (
        <div
          className="absolute top-full mt-1 bg-white rounded-xl shadow-lg z-20 overflow-hidden"
          style={{ border: '0.5px solid #E5E7EB', minWidth: 140, right: 0 }}
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
  children,
}: {
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors text-right"
      style={{ color: isSelected ? ACCENT : '#374151' }}
    >
      {isSelected && (
        <span className="text-xs flex-shrink-0" style={{ color: ACCENT }}>✓</span>
      )}
      {children}
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
  const [openDropdown, setOpenDropdown]         = useState<OpenDropdown>(null);
  const [programs, setPrograms]                 = useState<Program[]>([]);
  const filterRef = useRef<HTMLDivElement>(null);

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

  // ── Category change handler ───────────────────────────────────────────────
  function handleSetMode(mode: LeaderboardMode) {
    setLocalMode(mode);
    setCategory(MODE_TO_CATEGORY[mode]);
    setOpenDropdown(null);
    if (mode !== 'running')  setRunSegment('all');
    if (mode !== 'strength') setStrengthProgram(null);
  }

  // ── Leaderboard data ─────────────────────────────────────────────────────
  const getSocialUnlocked = useUserStore((s) => s.getSocialUnlocked);
  const socialUnlocked    = getSocialUnlocked();
  // bypassSocialGate overrides both gates — used for soft_launch cities so
  // seeded demo data is fully visible without a real referral.
  const shouldBlur = !bypassSocialGate && (!isLeagueActive || !socialUnlocked);

  const isSegmentMode = localMode === 'running' && runSegment !== 'all';

  const { entries, myEntry, isLoading, refresh } = useLeaderboard({
    scope,
    scopeId,
    category,
    timeWindow,
    genderFilter,
    programId: localMode === 'strength' ? strengthProgramId : null,
    dataMode: localMode === 'general'                    ? 'streak'
            : localMode === 'steps'                      ? 'steps'
            : isSegmentMode                              ? 'segment'
            : 'credit',
    runSegment: isSegmentMode ? (runSegment as RunSegmentFilter) : undefined,
  });

  useEffect(() => {
    onMyEntryChange?.(myEntry);
  }, [myEntry, onMyEntryChange]);

  const top3 = entries.slice(0, 3);
  const rest  = entries.slice(3);

  // ── Derived filter UI values ─────────────────────────────────────────────
  const activeCatOpt      = CATEGORY_OPTIONS.find((o) => o.value === localMode)!;
  const activeStrengthProg = programs.find((p) => p.id === strengthProgramId) ?? null;
  const showSubFilter      = localMode === 'running' || localMode === 'strength';
  const contextLabel       = getContextLabel(localMode, runSegment, activeStrengthProg);

  const catActive    = localMode !== 'general';
  const subActive    = localMode === 'running' ? runSegment !== 'all' : strengthProgramId !== null;
  const genderActive = genderFilter !== 'all';
  const timeActive   = timeWindow !== 'weekly';

  function getSubLabel(): string {
    if (localMode === 'running') {
      const opt = RUN_SEGMENT_OPTIONS.find((o) => o.value === runSegment)!;
      return `${opt.emoji} ${opt.label}`;
    }
    if (activeStrengthProg) return activeStrengthProg.name;
    return 'בחר';
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <section dir="rtl">
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{ border: '0.5px solid #E5E7EB' }}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="px-5 pt-5 pb-3" style={{ borderBottom: '0.5px solid #F3F4F6' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#E1F5EE' }}
              >
                <Trophy className="w-5 h-5" style={{ color: ACCENT }} />
              </div>
              <div>
                <h4 className="text-sm font-black text-gray-900">
                  {isGlobal ? 'דירוג ארצי' : 'ליגת העיר'}
                </h4>
                <p className="text-[10px] text-gray-500 font-medium">
                  {scopeLabel ?? 'טבלת דירוג'}
                </p>
              </div>
            </div>
            <button
              onClick={refresh}
              className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
              aria-label="רענון"
            >
              <RefreshCw
                className={`w-4 h-4 text-gray-500 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          {/* ── Dropdown filter buttons ───────────────────────────────── */}
          <div ref={filterRef} className="flex gap-2 flex-wrap">

            {/* קטגוריה */}
            <FilterDropdown
              label={`${activeCatOpt.emoji} ${activeCatOpt.label}`}
              isActive={catActive}
              isOpen={openDropdown === 'cat'}
              onToggle={() => setOpenDropdown(openDropdown === 'cat' ? null : 'cat')}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <DropdownItem
                  key={opt.value}
                  isSelected={localMode === opt.value}
                  onClick={() => handleSetMode(opt.value)}
                >
                  <span>{opt.emoji}</span>
                  {opt.label}
                </DropdownItem>
              ))}
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
                    <span>{opt.emoji}</span>
                    {opt.label}
                  </DropdownItem>
                ))}

                {localMode === 'strength' && (
                  programs.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-gray-400">טוען תוכניות...</div>
                  ) : (
                    programs.map((prog) => (
                      <DropdownItem
                        key={prog.id}
                        isSelected={strengthProgramId === prog.id}
                        onClick={() => { setStrengthProgram(prog.id); setOpenDropdown(null); }}
                      >
                        <span>{iconKeyEmoji(prog.iconKey)}</span>
                        {prog.name}
                      </DropdownItem>
                    ))
                  )
                )}
              </FilterDropdown>
            )}

            {/* מגדר */}
            <FilterDropdown
              label={GENDER_OPTIONS.find((o) => o.value === genderFilter)!.label}
              isActive={genderActive}
              isOpen={openDropdown === 'gender'}
              onToggle={() => setOpenDropdown(openDropdown === 'gender' ? null : 'gender')}
            >
              {GENDER_OPTIONS.map((opt) => (
                <DropdownItem
                  key={opt.value}
                  isSelected={genderFilter === opt.value}
                  onClick={() => { setGenderFilter(opt.value); setOpenDropdown(null); }}
                >
                  {opt.label}
                </DropdownItem>
              ))}
            </FilterDropdown>

            {/* טווח */}
            <FilterDropdown
              label={TIME_OPTIONS.find((o) => o.value === timeWindow)!.label}
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

          </div>

          {/* Context label */}
          {contextLabel && (
            <p className="mt-2 font-medium text-gray-400" style={{ fontSize: 10 }}>
              {contextLabel}
            </p>
          )}
        </div>

        {/* ── Podium + rows ────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-14">
            <div className="flex items-center gap-2 text-sm text-gray-400 animate-pulse">
              <Flame className="w-4 h-4" />
              טוען דירוג...
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <Medal className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm font-black text-gray-900">עוד אין נתונים</p>
            <p className="text-xs text-gray-400 mt-1">התחילו להתאמן כדי להופיע בטבלה!</p>
          </div>
        ) : (
          <>
            {/* Podium top-3 */}
            {top3.length > 0 && (
              <div className="flex items-end justify-center gap-3 px-5 pt-6 pb-4">
                {/* 2nd place */}
                {top3[1] && (
                  <div className="flex flex-col items-center gap-1.5 flex-1">
                    <div className={`${PODIUM_STYLES[1].size} rounded-full ${PODIUM_STYLES[1].bg} flex items-center justify-center text-white text-sm font-black ring-2 ${PODIUM_STYLES[1].ring} shadow-lg ${PODIUM_STYLES[1].shadow}`}>
                      {top3[1].name.charAt(0)}
                    </div>
                    <span className="text-xs">{PODIUM_STYLES[1].medal}</span>
                    <span className="text-[11px] font-bold text-gray-900 dark:text-gray-100 truncate max-w-[80px] text-center">
                      {top3[1].name}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                      {formatScore(top3[1].totalCredit, localMode, isSegmentMode)}
                    </span>
                  </div>
                )}
                {/* 1st place — elevated */}
                {top3[0] && (
                  <div className="flex flex-col items-center gap-1.5 flex-1 -mt-4">
                    <div className={`${PODIUM_STYLES[0].size} rounded-full ${PODIUM_STYLES[0].bg} flex items-center justify-center text-white text-lg font-black ring-3 ${PODIUM_STYLES[0].ring} shadow-xl ${PODIUM_STYLES[0].shadow}`}>
                      {top3[0].name.charAt(0)}
                    </div>
                    <span className="text-lg">{PODIUM_STYLES[0].medal}</span>
                    <span className="text-xs font-black text-gray-900 dark:text-gray-100 truncate max-w-[90px] text-center">
                      {top3[0].name}
                    </span>
                    <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 tabular-nums">
                      {formatScore(top3[0].totalCredit, localMode, isSegmentMode)}
                    </span>
                  </div>
                )}
                {/* 3rd place */}
                {top3[2] && (
                  <div className="flex flex-col items-center gap-1.5 flex-1">
                    <div className={`${PODIUM_STYLES[2].size} rounded-full ${PODIUM_STYLES[2].bg} flex items-center justify-center text-white text-sm font-black ring-2 ${PODIUM_STYLES[2].ring} shadow-lg ${PODIUM_STYLES[2].shadow}`}>
                      {top3[2].name.charAt(0)}
                    </div>
                    <span className="text-xs">{PODIUM_STYLES[2].medal}</span>
                    <span className="text-[11px] font-bold text-gray-900 dark:text-gray-100 truncate max-w-[80px] text-center">
                      {top3[2].name}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                      {formatScore(top3[2].totalCredit, localMode, isSegmentMode)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Rows 4+ */}
            {rest.length > 0 && (
              <div className="relative">
                <div className="border-t border-gray-100">
                  {rest.map((entry, idx) => (
                    <div
                      key={entry.uid}
                      className={`flex items-center gap-3 px-5 py-3 ${
                        idx !== rest.length - 1 ? 'border-b border-gray-50' : ''
                      } ${
                        shouldBlur ? 'blur-[6px] select-none pointer-events-none' : ''
                      }`}
                      style={{ backgroundColor: entry.isCurrentUser ? '#F0FBF6' : 'transparent' }}
                    >
                      <span className="w-7 text-center text-sm font-black text-gray-400 tabular-nums">
                        {entry.rank}
                      </span>

                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black shrink-0"
                        style={
                          entry.isCurrentUser
                            ? { backgroundColor: '#E1F5EE', color: ACCENT, boxShadow: `0 0 0 2px ${ACCENT}33` }
                            : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                        }
                      >
                        {entry.name.charAt(0)}
                      </div>

                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-gray-900 truncate block">
                            {entry.name}
                            {entry.isCurrentUser && (
                              <span className="text-[10px] font-medium mr-1" style={{ color: ACCENT }}>
                                (את/ה)
                              </span>
                            )}
                          </span>
                          {localMode !== 'general' && localMode !== 'steps' && !isSegmentMode && (
                            <span className="text-[10px] text-gray-400">{entry.workoutCount} אימונים</span>
                          )}
                        </div>

                        {/* Mode badges */}
                        {localMode === 'general' && (
                          <span
                            className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black leading-tight"
                            style={{ backgroundColor: '#FFF3E0', color: '#E65100' }}
                          >
                            🔥 רצף
                          </span>
                        )}
                        {localMode === 'strength' && (
                          <span
                            className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black leading-tight"
                            style={{ backgroundColor: '#E1F5EE', color: ACCENT }}
                          >
                            💪 כוח
                          </span>
                        )}
                      </div>

                      <span className="text-xs font-black text-gray-600 tabular-nums">
                        {formatScore(entry.totalCredit, localMode, isSegmentMode)}
                      </span>
                    </div>
                  ))}
                </div>

                {shouldBlur && (
                  <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-transparent flex flex-col items-center justify-center px-5 text-center">
                    <Lock className="w-5 h-5 mb-2" style={{ color: ACCENT }} />
                    <p className="text-sm font-black text-gray-900">הטבלה נעולה</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-[240px]">
                      {!socialUnlocked
                        ? 'הזמן שותף אחד כדי לפתוח את הטבלה המלאה'
                        : 'לחץ על העירייה כדי לפתוח את הליגה הרשמית'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Personal "you" rank card — rendered by the parent (community/page.tsx)
          as a shared sticky footer. Not duplicated here. */}
    </section>
  );
}
