'use client';

/**
 * PartnerFilterBar — multi-row filter system above the partner card list.
 *
 * Row visibility matrix:
 *   Row 1 — activity pills          [הכל][כוח][ריצה][הליכה]    (always)
 *   Row 2 — solo / group pills      [הכל][יחידים][קבוצות]       (always, both tabs)
 *   Row 3 — dynamic per activity:
 *             strength → program pills (every activeProgram the user
 *                        is enrolled in, labelled via CMS lookup)
 *             running  → distance slider (0–21 km, step 0.5)
 *             else     → hidden
 *   Row 4 — strength-only level range slider
 *             • strength + program selected → 1..program.maxLevels (CMS)
 *             • strength without program    → 1..max(maxLevels) across
 *               the user's enrolled programs, or DEFAULT_PROGRAM_MAX (20)
 *             • running / walking           → HIDDEN (cardio is
 *               filtered by distance + pace only — no level concept)
 *             Slider auto-resets to [1, max] when the user picks a
 *             different program pill so a stale window from the
 *             previous program never carries over.
 *   Row 4 (running)  — pace range slider (180-540 sec/km)
 *   Row 5 — time pills + slider     (scheduled tab only)
 *
 * Solo/group filtering — works on BOTH tabs. The live tab narrows
 * against `LivePartner.groupSessionId` (mirrored from the presence doc,
 * which `useGroupPresence` also consumes); the scheduled tab narrows
 * against `ScheduledPartner.source`. There is no longer an Option-C
 * auto-switch when [קבוצות] is tapped on live — the filter genuinely
 * narrows live partners now.
 *
 * Program pill source — every entry in `profile.progression.activePrograms`
 * is rendered as a pill. CMS data (`getCachedPrograms`, 5-min cache)
 * supplies canonical Hebrew labels and iconKeys, but we no longer
 * filter on `cms.isMaster` — that gate silently dropped legitimate
 * enrollments whose CMS metadata was incomplete. Cold-start fallback:
 * `PROGRAM_NAME_HE[templateId]` → enrollment `name`, so the row is
 * never empty while the cache warms.
 *
 * All filter state lives in `usePartnerFilters` so selections survive
 * tab switches, overlay close/reopen, and full page navigations
 * (persisted to localStorage).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  /**
   * Home v2 (enable_home_v2): render ONLY the activity row + a single
   * "סינון" pill (with the count of extra active filters). Every other
   * row moves into PartnerFilterSheet (see `PartnerFilterRowsV2`). The
   * level-range effects below keep running here either way, so the
   * filter semantics are identical — only where the controls live moves.
   */
  v2?: boolean;
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

// ── Shared model (program pills + level bound) ──────────────────────────────
// Extracted verbatim from PartnerFilterBar so the v2 filter sheet can
// render the same program pills / level slider bounds. Pure derivation +
// the cached CMS fetch — the level-range RESET/CLAMP effects stay in
// PartnerFilterBar (mounted for the whole overlay session) so they run
// exactly once, as before.
export function usePartnerFilterModel(
  liveActivity: LiveActivityFilter,
  selectedProgram: string | null,
) {
  // User profile (for program names + level bounds)
  const profile = useUserStore((s) => s.profile);
  const activePrograms = profile?.progression?.activePrograms ?? [];

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
  //
  // We render EVERY entry the user is enrolled in — there is no
  // `cms.isMaster` filter anymore. The previous filter silently dropped
  // legitimate strength enrollments whose CMS metadata was incomplete
  // (missing `isMaster`, missing CMS doc, sub-program enrollments
  // without a master mirror), which surfaced as "the program selector
  // row never appears" for many real users. The user-visible spec is
  // "show the programs the current user is actually enrolled in" —
  // the most direct read of that is `activePrograms`.
  const programPills = useMemo(() => {
    return activePrograms.map((up) => {
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

  // ── Level range bounds for Row 4 level slider ─────────────────────────────
  // Source of truth: `Program.maxLevels` from the CMS (loaded into
  // `programsById` above). NOT `DomainProgress.maxLevel`, which expresses
  // the CURRENT USER'S per-domain ceiling — fine for "what level am I
  // allowed to reach next?", wrong for "what level range can a PARTNER
  // be at?". The partner finder needs the program's theoretical range,
  // and that lives only on the CMS doc.
  //
  // Resolution priority (strength activity only — slider is hidden
  // otherwise so the running/walking branch returns a sentinel that
  // is never read):
  //   1. selectedProgram set → `programsById.get(selectedProgram).maxLevels`
  //      with the same `templateId → id` fallback chain that
  //      `programPills` uses, so legacy enrollments where the CMS
  //      doc id is in `up.id` (not `up.templateId`) still resolve.
  //   2. selectedProgram === null (הכל) → highest `maxLevels` across
  //      every program the user is enrolled in, expressing "any of my
  //      programs". This way a user on a 25-level program can still
  //      filter to L20 partners while the slider is on הכל; capping at
  //      a single number (e.g. 10) would silently hide them.
  //   3. Cold-start (CMS not yet loaded) OR user has no enrolled
  //      programs → DEFAULT_PROGRAM_MAX. 20 matches
  //      `ProgressionFilterSheet.DEFAULT_MAX_LEVELS` and the
  //      `admin/questionnaire` fallback so the partner UI agrees with
  //      every other "level grid" surface in the app.
  const DEFAULT_PROGRAM_MAX = 20;

  const levelMaxBound = useMemo(() => {
    if (liveActivity !== 'strength') return DEFAULT_PROGRAM_MAX;

    const resolveMaxFor = (templateOrId: string): number | undefined => {
      if (!programsById) return undefined;
      const direct = programsById.get(templateOrId);
      if (direct?.maxLevels && direct.maxLevels > 0) return direct.maxLevels;
      // Legacy fallback: an active enrollment may carry the CMS doc id
      // in `up.id` while the pill renders `up.templateId`.
      const ap = activePrograms.find(
        (p) => p.templateId === templateOrId || p.id === templateOrId,
      );
      if (ap) {
        const cms =
          programsById.get(ap.templateId) ?? programsById.get(ap.id);
        if (cms?.maxLevels && cms.maxLevels > 0) return cms.maxLevels;
      }
      return undefined;
    };

    if (selectedProgram) {
      return resolveMaxFor(selectedProgram) ?? DEFAULT_PROGRAM_MAX;
    }

    // הכל — pick the highest `maxLevels` across the user's enrolled
    // programs so the slider can express the union of every program's
    // range. Falls through to DEFAULT_PROGRAM_MAX when CMS hasn't
    // loaded yet (or the user has no enrolled programs at all).
    if (activePrograms.length > 0) {
      let highest = 0;
      for (const ap of activePrograms) {
        const max =
          resolveMaxFor(ap.templateId) ?? resolveMaxFor(ap.id);
        if (typeof max === 'number' && max > highest) highest = max;
      }
      if (highest > 0) return highest;
    }

    return DEFAULT_PROGRAM_MAX;
  }, [liveActivity, selectedProgram, programsById, activePrograms]);

  return { activePrograms, programPills, levelMaxBound };
}

// ── Home v2 pieces ───────────────────────────────────────────────────────────

function PillV2({ active, onClick, children }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 flex-shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
        active
          ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
          : 'bg-white text-v2-ink-2 shadow-v2-ring'
      }`}
    >
      {children}
    </button>
  );
}

/** Full pace window of the pace slider (sec/km) — "no narrowing". */
const PACE_FULL: [number, number] = [180, 540];
/** Full age window of the age slider — "no narrowing". */
const AGE_FULL: [number, number] = [18, 99];

/**
 * How many of the controls that live inside the v2 filter sheet are set
 * to something other than their neutral "הכל"/full-range value. Counts
 * only the controls the sheet actually shows for the current tab /
 * activity (same visibility matrix as the legacy rows). Display-only —
 * it never changes a filter.
 */
export function useExtraPartnerFilterCount(
  tab: 'live' | 'scheduled',
  levelMaxBound: number,
): number {
  const liveActivity = usePartnerFilters((s) => s.liveActivity);
  const soloGroupFilter = usePartnerFilters((s) => s.soloGroupFilter);
  const selectedProgram = usePartnerFilters((s) => s.selectedProgram);
  const levelRange = usePartnerFilters((s) => s.levelRange);
  const paceRange = usePartnerFilters((s) => s.paceRange);
  const plannedTime = usePartnerFilters((s) => s.plannedTime);
  const genderFilter = usePartnerFilters((s) => s.genderFilter);
  const ageRange = usePartnerFilters((s) => s.ageRange);

  let n = 0;
  if (soloGroupFilter !== 'all') n += 1;
  if (liveActivity === 'strength') {
    if (selectedProgram !== null) n += 1;
    if (levelRange[0] > 1 || levelRange[1] < levelMaxBound) n += 1;
  }
  if (liveActivity === 'running') {
    if (paceRange[0] > PACE_FULL[0] || paceRange[1] < PACE_FULL[1]) n += 1;
  }
  if (tab === 'scheduled' && plannedTime !== 'all') n += 1;
  if (genderFilter !== 'all') n += 1;
  if (ageRange[0] > AGE_FULL[0] || ageRange[1] < AGE_FULL[1]) n += 1;
  return n;
}

function SectionTitleV2({ children, value }: { children: React.ReactNode; value?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <span className="whitespace-nowrap text-[15px] font-black text-v2-ink">{children}</span>
      {value != null && (
        <span className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{value}</span>
      )}
    </div>
  );
}

function EdgeLabelsV2({ start, end }: { start: string; end: string }) {
  return (
    <div className="mt-0.5 flex justify-between text-[11px] font-bold text-v2-muted">
      <span>{start}</span>
      <span>{end}</span>
    </div>
  );
}

const V2_ACCENT = '#00baf7';

/**
 * The rows that used to sit on the overlay (type / program / level /
 * running distance + pace / scheduled day + time), restyled for v2 and
 * rendered INSIDE PartnerFilterSheet. Same store fields, same setters,
 * same visibility matrix as PartnerFilterBar rows 2–5 — the level
 * reset/clamp effects remain owned by the (still mounted) PartnerFilterBar.
 */
export function PartnerFilterRowsV2({ tab }: { tab: 'live' | 'scheduled' }) {
  const liveActivity = usePartnerFilters((s) => s.liveActivity);
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
  const scheduledTimeRange = usePartnerFilters((s) => s.scheduledTimeRange);
  const setScheduledTimeRange = usePartnerFilters((s) => s.setScheduledTimeRange);

  const { programPills, levelMaxBound } = usePartnerFilterModel(liveActivity, selectedProgram);

  const showStrength = liveActivity === 'strength';
  const showRunning = liveActivity === 'running';
  const showDay = tab === 'scheduled';
  const showTimeSlider = showDay && (plannedTime === 'today' || plannedTime === 'tomorrow');

  return (
    <>
      <section>
        <SectionTitleV2>סוג</SectionTitleV2>
        <div className="flex flex-wrap gap-2">
          {SOLO_GROUP_PILLS.map((p) => (
            <PillV2
              key={`sg_${p.value}`}
              active={soloGroupFilter === p.value}
              onClick={() => setSoloGroupFilter(p.value)}
            >
              {p.label}
            </PillV2>
          ))}
        </div>
      </section>

      {showDay && (
        <section>
          <SectionTitleV2>מתי</SectionTitleV2>
          <div className="flex flex-wrap gap-2">
            {PLANNED_TIME_PILLS.map((p) => (
              <PillV2
                key={`pti_${p.value}`}
                active={plannedTime === p.value}
                onClick={() => setPlannedTime(p.value)}
              >
                {p.label}
              </PillV2>
            ))}
          </div>
          {showTimeSlider && (
            <div className="mt-3">
              <SectionTitleV2
                value={
                  <span dir="ltr">
                    {formatTimeOfDay(scheduledTimeRange[0])} – {formatTimeOfDay(scheduledTimeRange[1])}
                  </span>
                }
              >
                <span className="text-[13px] font-extrabold text-v2-ink-2">טווח שעות</span>
              </SectionTitleV2>
              <DualRangeSlider
                min={6 * 60}
                max={22 * 60}
                step={15}
                values={scheduledTimeRange}
                onChange={setScheduledTimeRange}
                ariaLabelMin="שעת התחלה"
                ariaLabelMax="שעת סיום"
              />
            </div>
          )}
        </section>
      )}

      {showStrength && programPills.length > 0 && (
        <section>
          <SectionTitleV2>תוכנית</SectionTitleV2>
          <div className="flex flex-wrap gap-2">
            <PillV2 active={selectedProgram === null} onClick={() => setSelectedProgram(null)}>
              הכל
            </PillV2>
            {programPills.map((p) => (
              <PillV2
                key={`prog_${p.value}`}
                active={selectedProgram === p.value}
                onClick={() => setSelectedProgram(p.value)}
              >
                <span className="inline-flex max-w-[180px] items-center gap-1.5">
                  <span aria-hidden className="inline-flex flex-shrink-0" style={{ width: 14, height: 14 }}>
                    {getProgramIcon(p.iconKey, 'w-3.5 h-3.5')}
                  </span>
                  <span className="truncate">{p.label}</span>
                </span>
              </PillV2>
            ))}
          </div>
        </section>
      )}

      {showStrength && (
        <section>
          <SectionTitleV2 value={`${levelRange[0]}–${levelRange[1]}`}>רמה</SectionTitleV2>
          <DualRangeSlider
            min={1}
            max={levelMaxBound}
            step={1}
            values={levelRange}
            onChange={setLevelRange}
            ariaLabelMin="רמה מינימום"
            ariaLabelMax="רמה מקסימום"
          />
          <EdgeLabelsV2 start="מתחיל" end="מתקדם" />
        </section>
      )}

      {showRunning && (
        <section>
          <SectionTitleV2 value={`${runDistance} ק״מ`}>מרחק יעד</SectionTitleV2>
          <div className="relative w-full" style={{ height: 16 }}>
            <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 rounded-full bg-v2-hairline" />
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
              style={{
                right: 0,
                left: `${100 - (runDistance / 21) * 100}%`,
                backgroundColor: V2_ACCENT,
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
              style={{ accentColor: V2_ACCENT }}
              aria-label="מרחק יעד בקילומטרים"
            />
          </div>
        </section>
      )}

      {showRunning && (
        <section>
          <SectionTitleV2>קצב (דקות לק״מ)</SectionTitleV2>
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
          <EdgeLabelsV2 start="איטי" end="מהיר" />
        </section>
      )}
    </>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function PartnerFilterBar({ tab, onOpenSheet, onSwitchToScheduled, v2 = false }: PartnerFilterBarProps) {
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
  const scheduledTimeRange = usePartnerFilters((s) => s.scheduledTimeRange);
  const setScheduledTimeRange = usePartnerFilters((s) => s.setScheduledTimeRange);

  const { programPills, levelMaxBound } = usePartnerFilterModel(liveActivity, selectedProgram);

  // ── Reset levelRange to [1, max] on a USER-DRIVEN program change ──────────
  // When the user taps a different program pill, the previous range is
  // almost certainly stale (a "level 1-12" window for a 12-level program
  // makes no sense once they swap to a 25-level program). Resetting to
  // `[1, levelMaxBound]` gives them the full new range as a starting
  // point — the documented spec for this row.
  //
  // The first-render gate is critical: on initial mount, `selectedProgram`
  // is hydrated from localStorage (via `usePartnerFilters` persist), and
  // so is `levelRange`. The persisted pair was coherent when saved, so
  // resetting on mount would silently throw away the user's last range.
  // We only reset on subsequent changes by tracking the previous value
  // in a ref.
  const prevSelectedProgramRef = useRef<string | null>(selectedProgram);
  useEffect(() => {
    if (prevSelectedProgramRef.current === selectedProgram) return;
    prevSelectedProgramRef.current = selectedProgram;
    setLevelRange([1, levelMaxBound]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProgram]);

  // Defensive clamp — if the bound shrinks for any other reason (e.g.
  // CMS data finishes loading and reveals a smaller maxLevels than
  // DEFAULT_PROGRAM_MAX), pull the upper handle down so the slider stays
  // within a valid range. Lower handle is also clamped so the [min, max]
  // invariant is preserved.
  useEffect(() => {
    if (levelRange[1] > levelMaxBound) {
      setLevelRange([Math.min(levelRange[0], levelMaxBound), levelMaxBound]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelMaxBound]);

  // ── Solo/group tap handler ────────────────────────────────────────────────
  // The row is now visible on BOTH tabs and `LivePartner` carries a
  // `groupSessionId` field that the live filter narrows on, so we no
  // longer auto-switch tabs when the user taps [קבוצות]. The
  // `onSwitchToScheduled` prop is preserved on the component API for
  // backwards compatibility with any future surfaces that might want
  // to opt back in (it is intentionally unused here today).
  function handleSoloGroupTap(value: SoloGroupFilter) {
    setSoloGroupFilter(value);
  }

  // ── Row visibility flags ──────────────────────────────────────────────────
  // - Row 2 (solo / group) is shown on BOTH tabs. Live partners carry
  //   `groupSessionId` from the presence doc, so the pill genuinely
  //   narrows on both surfaces (alone vs. group session).
  // - Row 4 level slider is STRENGTH-ONLY. Running and walking are
  //   filterable by distance + pace only ("level is irrelevant for
  //   cardio") — the previous behaviour (level visible on every
  //   non-'all' activity) confused users with a slider that mapped
  //   onto `lemurStage` rather than anything cardio-specific.
  const showRow2SoloGroup = true;
  const showRow3Strength = liveActivity === 'strength';
  const showRow3Running = liveActivity === 'running';
  const showRow4Level = liveActivity === 'strength';
  const showRow4Running = liveActivity === 'running';
  const showRow5 = tab === 'scheduled';
  const showTimeSlider = showRow5 && (plannedTime === 'today' || plannedTime === 'tomorrow');

  // Home v2 — one chip row (activity) + a single "סינון" pill. Hook is
  // called unconditionally (before the branch) to keep hook order stable.
  const extraCount = useExtraPartnerFilterCount(tab, levelMaxBound);
  if (v2) {
    return (
      <div
        dir="rtl"
        className="flex items-center gap-2 overflow-x-auto px-4 py-1 scrollbar-none min-w-0 w-full"
        style={{ scrollbarWidth: 'none' }}
      >
        {ACTIVITY_PILLS.map((p) => (
          <PillV2
            key={`act_${p.value}`}
            active={liveActivity === p.value}
            onClick={() => setLiveActivity(p.value)}
          >
            {p.label}
          </PillV2>
        ))}
        <button
          type="button"
          onClick={onOpenSheet}
          className={`ms-auto flex h-9 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
            extraCount > 0
              ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
              : 'bg-white text-v2-ink-2 shadow-v2-ring'
          }`}
          aria-label={extraCount > 0 ? `סינון — ${extraCount} פעילים` : 'סינון'}
        >
          <SlidersHorizontal size={15} aria-hidden />
          סינון
          {extraCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-v2-deep px-1.5 text-[11px] font-black text-white">
              {extraCount}
            </span>
          )}
        </button>
      </div>
    );
  }

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
      {/* Live tab: narrows `LivePartner.groupSessionId` (set/unset).
          Scheduled tab: narrows `ScheduledPartner.source` (planned/event
          → solo, group → groups). Both surfaces actually filter today. */}
      {showRow2SoloGroup && (
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
      )}

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

      {/* ─── Row 4 — level range (strength only) ──────────────────────────── */}
      {/* Strength-only. For strength + selected program the upper bound
          comes from the program's domain `maxLevel`; without a selected
          program the bound is 10 (lemurStage). Cardio activities
          (running, walking) deliberately have NO level slider — they
          are filtered by distance + pace per the cardio spec. */}
      {showRow4Level && (
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
            <span className="text-[12px] font-bold text-gray-600">טווח שעות</span>
            <span className="text-[12px] font-black" dir="ltr" style={{ color: ACCENT }}>
              {formatTimeOfDay(scheduledTimeRange[0])} – {formatTimeOfDay(scheduledTimeRange[1])}
            </span>
          </div>
          <DualRangeSlider
            min={6 * 60}
            max={22 * 60}
            step={15}
            values={scheduledTimeRange}
            onChange={setScheduledTimeRange}
            ariaLabelMin="שעת התחלה"
            ariaLabelMax="שעת סיום"
          />
        </div>
      )}
    </div>
  );
}

export default PartnerFilterBar;
