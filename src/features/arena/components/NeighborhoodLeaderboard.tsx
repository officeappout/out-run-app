'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Trophy, RefreshCw, Lock, ChevronDown, Plus, UserPlus } from 'lucide-react';
import { useLeaderboard } from '@/features/arena/hooks/useLeaderboard';
import { useUserStore } from '@/features/user';
import ViralUnlockSheet from '@/features/safecity/components/ViralUnlockSheet';
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

// Vibrant multi-stop avatar gradients — deterministically assigned per user
// so each athlete keeps a consistent identity colour across renders.
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #6366F1, #8B5CF6)', // indigo → violet
  'linear-gradient(135deg, #EF4444, #F97316)', // crimson → orange
  'linear-gradient(135deg, #0EA5E9, #2563EB)', // sky → blue
  'linear-gradient(135deg, #10B981, #047857)', // emerald
  'linear-gradient(135deg, #EC4899, #BE185D)', // pink → magenta
  'linear-gradient(135deg, #F59E0B, #EA580C)', // amber → orange
  'linear-gradient(135deg, #14B8A6, #0E7490)', // teal → cyan
  'linear-gradient(135deg, #A855F7, #6D28D9)', // purple
];

function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

// Metallic rank rings (gold / silver / bronze) + per-rank podium geometry.
const RANK_CONFIG: Record<1 | 2 | 3, {
  ring: string;
  medal: string;
  glow: string;
  step: string;
  stepHeight: number;
  avatar: number;
}> = {
  1: {
    ring: 'linear-gradient(135deg, #FEF3C7 0%, #FBBF24 45%, #B45309 100%)',
    medal: '🥇',
    glow: '0 6px 18px rgba(245,158,11,0.45)',
    step: 'linear-gradient(180deg, #34D399 0%, #1D9E75 55%, #147C5C 100%)',
    stepHeight: 78,
    avatar: 62,
  },
  2: {
    ring: 'linear-gradient(135deg, #F8FAFC 0%, #CBD5E1 45%, #8593A8 100%)',
    medal: '🥈',
    glow: '0 5px 14px rgba(148,163,184,0.4)',
    step: 'linear-gradient(180deg, #2BB587 0%, #1D9E75 60%, #15805F 100%)',
    stepHeight: 56,
    avatar: 50,
  },
  3: {
    ring: 'linear-gradient(135deg, #FED7AA 0%, #FB923C 45%, #9A3412 100%)',
    medal: '🥉',
    glow: '0 5px 14px rgba(234,88,12,0.4)',
    step: 'linear-gradient(180deg, #25A87B 0%, #1B9070 60%, #136B50 100%)',
    stepHeight: 42,
    avatar: 50,
  },
};

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

// ── Podium column — real entry OR dashed "invite a friend" placeholder ───────

interface PodiumColumnProps {
  entry: LeaderboardEntry | null;
  rank: 1 | 2 | 3;
  mode: LeaderboardMode;
  isSegmentMode: boolean;
  onInvite: () => void;
}

function PodiumColumn({ entry, rank, mode, isSegmentMode, onInvite }: PodiumColumnProps) {
  const cfg = RANK_CONFIG[rank];

  // ── Empty slot → gorgeous dashed placeholder that opens the invite sheet ──
  if (!entry) {
    return (
      <button
        type="button"
        onClick={onInvite}
        className="group flex flex-col items-center justify-end gap-1.5 outline-none"
      >
        <div
          className="rounded-full border-2 border-dashed border-gray-300 bg-gray-50/70 flex items-center justify-center text-gray-400 transition-all group-hover:border-[#1D9E75] group-hover:text-[#1D9E75] group-active:scale-95"
          style={{ width: cfg.avatar, height: cfg.avatar }}
        >
          <Plus className="w-5 h-5" strokeWidth={2.5} />
        </div>
        <span className="text-[11px] font-black text-gray-500 leading-none mt-0.5">פנוי!</span>
        <span className="text-[9px] font-medium text-gray-400 leading-none">הזמן חבר</span>
        <div
          className="w-full rounded-t-xl border-2 border-dashed border-gray-200 bg-gray-50/50 mt-1"
          style={{ height: cfg.stepHeight }}
        />
      </button>
    );
  }

  const elevated = rank === 1;

  return (
    <div className={`flex flex-col items-center justify-end gap-1 ${elevated ? '-mt-2' : ''}`}>
      <span className={elevated ? 'text-xl leading-none' : 'text-base leading-none'}>{cfg.medal}</span>

      {/* Metallic ring wrapper → vibrant gradient avatar */}
      <div
        style={{ background: cfg.ring, padding: elevated ? 4 : 3, borderRadius: 9999, boxShadow: cfg.glow }}
      >
        <div
          className="rounded-full flex items-center justify-center text-white font-black"
          style={{
            width: cfg.avatar,
            height: cfg.avatar,
            background: avatarGradient(entry.uid || entry.name),
            fontSize: elevated ? 22 : 18,
          }}
        >
          {entry.name.charAt(0)}
        </div>
      </div>

      <span className="text-[11px] font-black text-gray-900 truncate max-w-[84px] text-center mt-0.5">
        {entry.name}
      </span>
      <span className="text-[10px] font-bold text-gray-500 tabular-nums leading-none">
        {formatScore(entry.totalCredit, mode, isSegmentMode)}
      </span>

      {/* 3D gradient step */}
      <div
        className="w-full rounded-t-xl relative overflow-hidden mt-1 shadow-[0_4px_10px_rgba(20,124,92,0.25)]"
        style={{ height: cfg.stepHeight, background: cfg.step }}
      >
        {/* top highlight face for the 3D illusion */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-white/30" />
        <span className="absolute inset-0 flex items-center justify-center text-white font-black text-lg opacity-90 tabular-nums">
          {rank}
        </span>
      </div>
    </div>
  );
}

// ── Skeletons (CLS-safe — mirror the live podium + row geometry exactly) ─────

function PodiumSkeleton() {
  return (
    <div className="px-5 pt-6 pb-3">
      <div className="grid grid-cols-3 items-end gap-2">
        {([2, 1, 3] as const).map((rank) => {
          const cfg = RANK_CONFIG[rank];
          return (
            <div key={rank} className="flex flex-col items-center justify-end gap-1.5">
              <div
                className="rounded-full bg-gray-200 animate-pulse"
                style={{ width: cfg.avatar, height: cfg.avatar }}
              />
              <div className="h-2.5 w-14 rounded bg-gray-200 animate-pulse" />
              <div className="h-2 w-8 rounded bg-gray-100 animate-pulse" />
              <div
                className="w-full rounded-t-xl bg-gray-100 animate-pulse mt-1"
                style={{ height: cfg.stepHeight }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Row skeleton — uses the SAME wrapper classes as a live row
 * (`flex items-center gap-3 px-5 py-3`) so it occupies an identical height,
 * guaranteeing zero layout shift when real data swaps in.
 */
function LeaderboardRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-50">
      <span className="w-7 flex justify-center">
        <span className="w-3.5 h-3.5 rounded bg-gray-200 animate-pulse" />
      </span>
      <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-2.5 rounded bg-gray-200 animate-pulse" style={{ width: '55%' }} />
        <div className="h-2 rounded bg-gray-100 animate-pulse" style={{ width: '30%' }} />
      </div>
      <div className="h-3 w-10 rounded bg-gray-200 animate-pulse" />
    </div>
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
  const [showInvite, setShowInvite]             = useState(false);
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
  const activeCatOpt      = CATEGORY_OPTIONS.find((o) => o.value === localMode) ?? CATEGORY_OPTIONS[0];
  const activeStrengthProg = programs.find((p) => p.id === strengthProgramId) ?? null;
  const showSubFilter      = localMode === 'running' || localMode === 'strength';
  const contextLabel       = getContextLabel(localMode, runSegment, activeStrengthProg);

  const catActive    = localMode !== 'general';
  const subActive    = localMode === 'running' ? runSegment !== 'all' : strengthProgramId !== null;
  const genderActive = genderFilter !== 'all';
  const timeActive   = timeWindow !== 'weekly';

  function getSubLabel(): string {
    if (localMode === 'running') {
      const opt = RUN_SEGMENT_OPTIONS.find((o) => o.value === runSegment) ?? RUN_SEGMENT_OPTIONS[0];
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
              label={(GENDER_OPTIONS.find((o) => o.value === genderFilter) ?? GENDER_OPTIONS[0]).label}
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
          <>
            <PodiumSkeleton />
            <div className="border-t border-gray-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <LeaderboardRowSkeleton key={i} />
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Podium — always a 3-column stage. Empty slots become dashed
                "invite a friend" placeholders so the league never looks like
                a ghost town, even with 0–2 players. */}
            <div className="px-5 pt-6 pb-3">
              <div className="grid grid-cols-3 items-end gap-2">
                {/* DOM order [2,1,3] → 1st place lands in the centre column */}
                <PodiumColumn entry={top3[1] ?? null} rank={2} mode={localMode} isSegmentMode={isSegmentMode} onInvite={() => setShowInvite(true)} />
                <PodiumColumn entry={top3[0] ?? null} rank={1} mode={localMode} isSegmentMode={isSegmentMode} onInvite={() => setShowInvite(true)} />
                <PodiumColumn entry={top3[2] ?? null} rank={3} mode={localMode} isSegmentMode={isSegmentMode} onInvite={() => setShowInvite(true)} />
              </div>
            </div>

            {/* Rows 4+ */}
            {rest.length > 0 ? (
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
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0"
                        style={
                          entry.isCurrentUser
                            ? { background: avatarGradient(entry.uid || entry.name), boxShadow: `0 0 0 2px ${ACCENT}` }
                            : { background: avatarGradient(entry.uid || entry.name) }
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
                            style={
                              scope === 'tenant'
                                ? { backgroundColor: '#E1F5EE', color: ACCENT }
                                : { backgroundColor: '#FFF3E0', color: '#E65100' }
                            }
                          >
                            {scope === 'tenant' ? '📅 ימים פעילים' : '🔥 רצף'}
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
                    <p className="text-xs text-gray-500 mt-1 mb-3 max-w-[240px]">
                      {!socialUnlocked
                        ? 'הזמן שותף אחד כדי לפתוח את הטבלה המלאה'
                        : 'לחץ על העירייה כדי לפתוח את הליגה הרשמית'}
                    </p>
                    {!socialUnlocked && (
                      <button
                        type="button"
                        onClick={() => setShowInvite(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-xs font-black shadow-lg active:scale-95 transition-transform"
                        style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
                      >
                        <UserPlus className="w-4 h-4" />
                        הזמן שותף
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : entries.length === 0 ? (
              <div className="px-5 pb-6 -mt-1 flex flex-col items-center text-center">
                {/* 3-step activation guide — orients the very first user in an empty league */}
                <div className="w-full max-w-[300px] rounded-2xl border border-gray-100 bg-gray-50/80 p-3 mb-4">
                  <div className="flex flex-col gap-2.5">
                    {[
                      { icon: Plus, label: 'אמן כאן את האימון הראשון' },
                      { icon: UserPlus, label: 'הזמן שותף לליגה' },
                      { icon: Trophy, label: 'פתח את הליגה ותפוס את הפודיום' },
                    ].map((step, i) => {
                      const StepIcon = step.icon;
                      return (
                        <div key={i} className="flex items-center gap-2.5 text-right">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 relative"
                            style={{ backgroundColor: `${ACCENT}1A` }}
                          >
                            <StepIcon className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                            <span
                              className="absolute -top-1 -left-1 w-3.5 h-3.5 rounded-full text-white text-[9px] font-black flex items-center justify-center"
                              style={{ backgroundColor: ACCENT }}
                            >
                              {i + 1}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-gray-700 flex-1">{step.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <p className="text-xs font-bold text-gray-500 max-w-[260px] leading-relaxed">
                  היו הראשונים בליגה! הזמינו חברים והתחילו להתאמן כדי לתפוס את הפודיום 🏆
                </p>
                <button
                  type="button"
                  onClick={() => setShowInvite(true)}
                  className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-xs font-black shadow-lg active:scale-95 transition-transform"
                  style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
                >
                  <UserPlus className="w-4 h-4" />
                  הזמן חברים לליגה
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Invite sheet — opened by dashed podium placeholders, the locked-table
          CTA, and the empty-state button. */}
      <ViralUnlockSheet isOpen={showInvite} onClose={() => setShowInvite(false)} />

      {/* Personal "you" rank card — rendered by the parent (community/page.tsx)
          as a shared sticky footer. Not duplicated here. */}
    </section>
  );
}
