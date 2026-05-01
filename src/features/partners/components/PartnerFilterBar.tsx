'use client';

/**
 * PartnerFilterBar — multi-row filter system above the partner card list.
 *
 * Row visibility matrix:
 *   Row 1 — activity pills          [הכל][כוח][ריצה][הליכה]   (always)
 *   Row 2 — solo / group pills      [הכל][יחידים][קבוצות]      (always)
 *   Row 3 — dynamic per activity:
 *             strength → program pills (user's active master programs)
 *             running  → distance slider (0–21 km, step 0.5)
 *             else     → hidden
 *   Row 4 — dynamic per activity:
 *             strength + program selected → level range slider
 *             running                     → pace range slider
 *             else                        → hidden
 *   Row 5 — time pills + slider     (scheduled tab only)
 *
 * Tab handling — Option C for [קבוצות] on the live tab:
 *   live partners (presence/{uid}) carry no group identifier, so a
 *   "groups" filter on the live tab would always return zero results.
 *   When the user taps [קבוצות] from the live tab we instead:
 *     1. set soloGroupFilter('groups')
 *     2. fire onSwitchToScheduled() so the parent can flip activeTab
 *   PartnerOverlay then shows a transient hint explaining the switch.
 *
 * Master-program detection is async via getCachedPrograms() (5-min cache,
 * one Firestore read per cache miss). On cold start we render every
 * activeProgram entry as a fallback so the row never appears empty.
 *
 * All filter state lives in `usePartnerFilters` so selections survive
 * tab switches, overlay close/reopen, and full page navigations
 * (persisted to localStorage).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  usePartnerFilters,
  type LiveActivityFilter,
  type SoloGroupFilter,
  type PlannedTimeFilter,
} from '../hooks/usePartnerFilters';
import { useUserStore } from '@/features/user';
import { getCachedPrograms } from '@/features/workout-engine/services/program-hierarchy.utils';
import { resolveIconKey, getProgramIcon } from '@/features/content/programs';
import type { Program } from '@/features/content/programs/core/program.types';
import { PROGRAM_NAME_HE } from '@/lib/utils/program-names';
import { DualRangeSlider } from './DualRangeSlider';

// ── Props ────────────────────────────────────────────────────────────────────

interface PartnerFilterBarProps {
  tab: 'live' | 'scheduled';
  onOpenSheet: () => void;
  /**
   * Fired when [קבוצות] is tapped on the live tab. Parent should flip
   * activeTab to 'scheduled' and (optionally) display a transient hint.
   */
  onSwitchToScheduled?: () => void;
}

// ── Pill catalogues ──────────────────────────────────────────────────────────

interface PillDef<V extends string> {
  value: V;
  label: string;
}

const ACTIVITY_PILLS: PillDef<LiveActivityFilter>[] = [
  { value: 'all', label: 'הכל' },
  { value: 'strength', label: 'כוח' },
  { value: 'running', label: 'ריצה' },
  { value: 'walking', label: 'הליכה' },
];

const SOLO_GROUP_PILLS: PillDef<SoloGroupFilter>[] = [
  { value: 'all', label: 'הכל' },
  { value: 'solo', label: 'יחידים' },
  { value: 'groups', label: 'קבוצות' },
];

const PLANNED_TIME_PILLS: PillDef<PlannedTimeFilter>[] = [
  { value: 'all', label: 'הכל' },
  { value: 'today', label: 'היום' },
  { value: 'tomorrow', label: 'מחר' },
];

const ACCENT = '#00ADEF';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** seconds-per-km → "M:SS" (e.g. 345 → "5:45"). */
function formatPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** minutes-from-midnight → "HH:MM" (e.g. 480 → "08:00"). */
function formatTimeOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// ── Pill button ──────────────────────────────────────────────────────────────

interface PillProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function Pill({ active, onClick, children }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 rounded-full px-3.5 text-[13px] font-bold transition-colors active:scale-95"
      style={{
        height: 32,
        backgroundColor: active ? ACCENT : '#FFFFFF',
        color: active ? '#FFFFFF' : '#4B5563',
        border: active ? 'none' : '0.5px solid rgba(0,0,0,0.12)',
      }}
    >
      {children}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function PartnerFilterBar({ tab, onOpenSheet, onSwitchToScheduled }: PartnerFilterBarProps) {
  // Filter store
  const liveActivity = usePartnerFilters((s) => s.liveActivity);
  const setLiveActivity = usePartnerFilters((s) => s.setLiveActivity);
  const soloGroupFilter = usePartnerFilters((s) => s.soloGroupFilter);
  const setSoloGroupFilter = usePartnerFilters((s) => s.setSoloGroupFilter);
  const selectedProgram = usePartnerFilters((s) => s.selectedProgram);
  const setSelectedProgram = usePartnerFilters((s) => s.setSelectedProgram);
  const runDistance = usePartnerFilters((s) => s.runDistance);
  const setRunDistance = usePartnerFilters((s) => s.setRunDistance);
  const levelRange = usePartnerFilters((s) => s.levelRange);
  const setLevelRange = usePartnerFilters((s) => s.setLevelRange);
  const paceRange = usePartnerFilters((s) => s.paceRange);
  const setPaceRange = usePartnerFilters((s) => s.setPaceRange);
  const plannedTime = usePartnerFilters((s) => s.plannedTime);
  const setPlannedTime = usePartnerFilters((s) => s.setPlannedTime);
  const scheduledTimeMinutes = usePartnerFilters((s) => s.scheduledTimeMinutes);
  const setScheduledTimeMinutes = usePartnerFilters((s) => s.setScheduledTimeMinutes);

  // User profile (for program names + level bounds)
  const profile = useUserStore((s) => s.profile);
  const activePrograms = profile?.progression?.activePrograms ?? [];
  const domains = profile?.progression?.domains ?? {};

  // ── CMS programs (async, cached 5min by program-hierarchy) ───────────────
  // Fetched once for two reasons:
  //   1. Resolve `isMaster` to filter out sub-programs from the pill row.
  //   2. Resolve the canonical Hebrew display name + iconKey from Firestore.
  // Cold-start fallback: render every activeProgram with PROGRAM_NAME_HE /
  // .name — the row is never empty while the cache warms.
  const [programsById, setProgramsById] = useState<Map<string, Program> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCachedPrograms()
      .then((programs) => {
        if (cancelled) return;
        const byId = new Map<string, Program>();
        for (const p of programs) byId.set(p.id, p);
        setProgramsById(byId);
      })
      .catch(() => {
        // Swallow — fallback render (all activePrograms) already in place.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build pill descriptors. The user's `UserActiveProgram` carries both an
  // enrollment `id` and the source `templateId`; on legacy data either may
  // contain the raw Firestore document ID rather than a slug like
  // `'full_body'`. Cross-reference the CMS map first (canonical Hebrew
  // name + iconKey), then fall through to PROGRAM_NAME_HE on the slug,
  // then to whatever name was stored on enrollment.
  const programPills = useMemo(() => {
    const filtered = programsById
      ? activePrograms.filter((up) => {
          const cmsByTemplate = programsById.get(up.templateId);
          const cmsById = programsById.get(up.id);
          const cms = cmsByTemplate ?? cmsById;
          return cms ? cms.isMaster : true;
        })
      : activePrograms;
    return filtered.map((up) => {
      const cms = programsById?.get(up.templateId) ?? programsById?.get(up.id);
      const label =
        cms?.name
        ?? PROGRAM_NAME_HE[up.templateId]
        ?? PROGRAM_NAME_HE[up.id]
        ?? up.name;
      const iconKey = resolveIconKey(cms?.iconKey, up.templateId);
      return { value: up.templateId, label, iconKey };
    });
  }, [activePrograms, programsById]);

  // ── Level range bounds for Row 4 strength slider ──────────────────────────
  // Resolve via selectedProgram → activeProgram.focusDomains[0] → maxLevel.
  // Fallback 10 (matches DEFAULTS) when domain or program is not yet wired.
  const levelMaxBound = useMemo(() => {
    const program = activePrograms.find((p) => p.templateId === selectedProgram);
    const domainId = program?.focusDomains?.[0];
    if (!domainId) return 10;
    const max = domains[domainId]?.maxLevel;
    return typeof max === 'number' && max > 0 ? max : 10;
  }, [activePrograms, domains, selectedProgram]);

  // Defensive clamp — if maxLevel shrinks (e.g. user switches to a program
  // with smaller max), pull the upper handle down so the slider stays valid.
  useEffect(() => {
    if (levelRange[1] > levelMaxBound) {
      setLevelRange([Math.min(levelRange[0], levelMaxBound), levelMaxBound]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelMaxBound]);

  // ── Option C — [קבוצות] on live tab auto-switches to scheduled ────────────
  function handleSoloGroupTap(value: SoloGroupFilter) {
    setSoloGroupFilter(value);
    if (value === 'groups' && tab === 'live') {
      onSwitchToScheduled?.();
    }
  }

  // ── Row visibility flags ──────────────────────────────────────────────────
  const showRow3Strength = liveActivity === 'strength';
  const showRow3Running = liveActivity === 'running';
  const showRow4Strength = liveActivity === 'strength' && selectedProgram !== null;
  const showRow4Running = liveActivity === 'running';
  const showRow5 = tab === 'scheduled';
  const showTimeSlider = showRow5 && (plannedTime === 'today' || plannedTime === 'tomorrow');

  // Display value for the time slider — null falls back to a centered noon
  // marker so the thumb is visible even before the user makes a selection.
  const timeSliderValue = scheduledTimeMinutes ?? 720;

  return (
    // `w-full min-w-0` on the root so the column itself never expands past
    // the overlay wrapper (which now constrains to viewport width). Each
    // scrolling row below also carries `min-w-0` for the same reason —
    // flex items default to `min-width: auto`, so without it the rows
    // would grow to fit their pills' intrinsic width and overflow off
    // the right edge in RTL.
    <div dir="rtl" className="flex flex-col gap-2 w-full min-w-0">
      {/* ─── Row 1 — activity + "more filters" ────────────────────────────── */}
      <div
        className="flex items-center gap-2 overflow-x-auto px-4 scrollbar-none min-w-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {ACTIVITY_PILLS.map((p) => (
          <Pill
            key={`act_${p.value}`}
            active={liveActivity === p.value}
            onClick={() => setLiveActivity(p.value)}
          >
            {p.label}
          </Pill>
        ))}
        <button
          type="button"
          onClick={onOpenSheet}
          className="flex-shrink-0 rounded-full flex items-center gap-1.5 px-3.5 text-[13px] font-bold text-gray-700 active:scale-95 transition-transform"
          style={{
            height: 32,
            backgroundColor: '#FFFFFF',
            border: '0.5px solid rgba(0,0,0,0.12)',
          }}
          aria-label="פתח פילטרים נוספים"
        >
          <SlidersHorizontal size={13} aria-hidden />
          עוד פילטרים
        </button>
      </div>

      {/* ─── Row 2 — solo / group ─────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 overflow-x-auto px-4 scrollbar-none min-w-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {SOLO_GROUP_PILLS.map((p) => (
          <Pill
            key={`sg_${p.value}`}
            active={soloGroupFilter === p.value}
            onClick={() => handleSoloGroupTap(p.value)}
          >
            {p.label}
          </Pill>
        ))}
      </div>

      {/* ─── Row 3 strength — program pills ───────────────────────────────── */}
      {showRow3Strength && programPills.length > 0 && (
        <div
          className="flex items-center gap-2 overflow-x-auto px-4 scrollbar-none min-w-0"
          style={{ scrollbarWidth: 'none' }}
        >
          <Pill active={selectedProgram === null} onClick={() => setSelectedProgram(null)}>
            הכל
          </Pill>
          {programPills.map((p) => (
            <Pill
              key={`prog_${p.value}`}
              active={selectedProgram === p.value}
              onClick={() => setSelectedProgram(p.value)}
            >
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-flex" style={{ width: 14, height: 14 }}>
                  {getProgramIcon(p.iconKey, 'w-3.5 h-3.5')}
                </span>
                {p.label}
              </span>
            </Pill>
          ))}
        </div>
      )}

      {/* ─── Row 3 running — distance slider ──────────────────────────────── */}
      {showRow3Running && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-bold text-gray-600">מרחק יעד</span>
            <span className="text-[12px] font-black" style={{ color: ACCENT }}>
              {runDistance} ק״מ
            </span>
          </div>
          {/* Wrapped track: gray rail + accent fill from right edge (0 km)
              to the thumb. Native <input> rides on top with a transparent
              track so only the thumb shows; dir="rtl" matches the FilterBar. */}
          <div className="relative w-full" style={{ height: 16 }}>
            <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 bg-gray-200 rounded-full" />
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
              style={{
                right: 0,
                left: `${100 - (runDistance / 21) * 100}%`,
                backgroundColor: ACCENT,
              }}
            />
            <input
              type="range"
              min={0}
              max={21}
              step={0.5}
              value={runDistance}
              dir="rtl"
              onChange={(e) => setRunDistance(Number(e.target.value))}
              className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer"
              style={{ accentColor: ACCENT }}
              aria-label="מרחק יעד בקילומטרים"
            />
          </div>
        </div>
      )}

      {/* ─── Row 4 strength — level range ─────────────────────────────────── */}
      {showRow4Strength && (
        <div className="px-4">
          <div className="mb-1">
            <span className="text-[12px] font-bold text-gray-600">רמה</span>
          </div>
          <DualRangeSlider
            min={1}
            max={levelMaxBound}
            step={1}
            values={levelRange}
            onChange={setLevelRange}
            ariaLabelMin="רמה מינימום"
            ariaLabelMax="רמה מקסימום"
          />
          {/* Edge labels: under RTL, first child sits on the right (low side),
              second on the left (high side). */}
          <div className="flex justify-between" style={{ fontSize: 10, color: '#9CA3AF' }}>
            <span>מתחיל</span>
            <span>מתקדם</span>
          </div>
        </div>
      )}

      {/* ─── Row 4 running — pace range ───────────────────────────────────── */}
      {showRow4Running && (
        <div className="px-4">
          <div className="mb-1">
            <span className="text-[12px] font-bold text-gray-600">קצב (דקות לק״מ)</span>
          </div>
          <DualRangeSlider
            min={180}
            max={540}
            step={5}
            values={paceRange}
            onChange={setPaceRange}
            formatLabel={formatPace}
            ariaLabelMin="קצב מינימום"
            ariaLabelMax="קצב מקסימום"
          />
          {/* Edge labels: under RTL, first child sits on the right (slow =
              higher seconds-per-km), second on the left (fast = lower). */}
          <div className="flex justify-between" style={{ fontSize: 10, color: '#9CA3AF' }}>
            <span>איטי</span>
            <span>מהיר</span>
          </div>
        </div>
      )}

      {/* ─── Row 5 — time pills + slider (scheduled tab only) ─────────────── */}
      {showRow5 && (
        <div
          className="flex items-center gap-2 overflow-x-auto px-4 scrollbar-none min-w-0"
          style={{ scrollbarWidth: 'none' }}
        >
          {PLANNED_TIME_PILLS.map((p) => (
            <Pill
              key={`pti_${p.value}`}
              active={plannedTime === p.value}
              onClick={() => setPlannedTime(p.value)}
            >
              {p.label}
            </Pill>
          ))}
        </div>
      )}

      {showTimeSlider && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-bold text-gray-600">שעה</span>
            <span className="text-[12px] font-black" dir="ltr" style={{ color: ACCENT }}>
              {scheduledTimeMinutes !== null ? formatTimeOfDay(scheduledTimeMinutes) : '—'}
            </span>
          </div>
          <input
            type="range"
            min={360}
            max={1320}
            step={15}
            value={timeSliderValue}
            onChange={(e) => setScheduledTimeMinutes(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: ACCENT }}
            aria-label="שעת אימון"
          />
        </div>
      )}
    </div>
  );
}

export default PartnerFilterBar;
