'use client';

/**
 * SecondaryFiltersSheet — the funnel-icon bottom sheet.
 *
 * Merges what used to be two separate sheets (ProgressionFilterSheet +
 * EquipmentFilterSheet in 'filter' mode) into one: מסלול (with per-track
 * רמה nested inside it), מיקום, ציוד, plus שרירים (kept here for
 * AND-combination transparency with the top bar). Open/close state lives
 * in the store (isSecondaryFiltersOpen) because the trigger button sits in
 * /search's AppHeader — a different subtree from this sheet, which is
 * rendered inside the embedded exercises-tab body.
 *
 * מיקום and ציוד are independent selections (no location→gear auto-fill
 * preset). מיקום also filters the result set (round 2, #7).
 *
 * מסלול (round 5, #3 + #6 + #8):
 *   - A master program (Program.isMaster) is collapsible — collapsed by
 *     default, a chevron button (separate from the pill's own tap-to-select
 *     area, so the two interactions never collide) expands/collapses its
 *     subPrograms children beneath it, mirroring the admin panel's
 *     hierarchy instead of one flat list.
 *   - A child shared by more than one master (e.g. "דחיפה" under both
 *     כל הגוף and קליסטניקס עליון) is only ever rendered under the FIRST
 *     master that claims it — masters are walked in catalog order and each
 *     child id is added to a running `claimed` set, so it can't sprawl
 *     across multiple expanded groups.
 *   - Level is PER-TRACK, not global (round 5, #6): selecting a track
 *     renders its own level scale directly beneath its pill; a level chosen
 *     there is never checked against a different track. Tracks combine
 *     with OR — an exercise matches if ANY selected track's own tag+level
 *     condition holds (round 5, #1 confirmed: AND across dimensions, OR
 *     within one). See useExerciseLibraryStore's `levelsByProgram` doc
 *     comment for the full migration note from round 4's flat
 *     `programIds`+`levels`.
 *   - A MASTER never gets a level grid (round 6, #1) — only a child/leaf
 *     program does. A master's own level numbering has no relationship to
 *     its children's (e.g. a Hub's level 2 isn't push/pull's level 2 —
 *     David's example put them roughly around push/pull's level 11), so
 *     selecting a master always means "every level of every child",
 *     matching the union resolveProgramMatchIds already builds for it.
 *     exerciseMatchesTracks (useExerciseLibraryFilters.ts) enforces this
 *     at the data layer too — a master's levelsByProgram entry is ignored
 *     even if somehow non-empty, not just hidden in this UI.
 *
 * `programs`/`gear` — programs come from the store (allPrograms, loaded
 * once by ExerciseLibraryPage); gear is still passed as a prop since only
 * the sheet/chips-row need it, not the filtering logic itself.
 *
 * The "שרירים" section reads/writes `filters.muscles` directly (no draft)
 * so it stays two-way-synced with the top MuscleFilterBar in real time —
 * both are just views onto the same store field. It ALSO highlights, in a
 * distinct secondary style, the muscles CANONICALLY associated with the
 * draft-selected track(s) (round 5, #4 — fixes round 4's version, which
 * derived associations from which exercises HAPPEN to be tagged with a
 * matching primary muscle in Firestore today; that's an incomplete,
 * data-dependent proxy for an anatomical fact — e.g. Pull not currently
 * highlighting Back just meant no exercise tagged primaryMuscle=back
 * AND a Pull program happened to satisfy both conditions at once, not
 * that Pull and Back aren't associated). Now sourced from
 * PROG_TO_CHIPS/domainsToChipIds in src/lib/muscle-chips.const.ts — the
 * SAME canonical track↔muscle mapping the home workout builder already
 * uses for its own muscle-chip auto-selection, so this is authoritative
 * rather than derived. Purely informational either way: never written to
 * filters.muscles, never narrows results.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, PersonStanding } from 'lucide-react';
import FilterSheet from './FilterSheet';
import {
  useExerciseLibraryStore,
  BODYWEIGHT_SENTINEL,
} from '../store/useExerciseLibraryStore';
import {
  resolveProgramMatchIds,
  exerciseMatchesTracks,
  collectExerciseEquipmentIds,
  exerciseHasLocationMethod,
} from '../hooks/useExerciseLibraryFilters';
import { MUSCLE_BAR_CHIPS, chipIsActive, toggleMuscleChip } from '../utils/muscle-bar.utils';
import { domainsToChipIds } from '@/lib/muscle-chips.const';
import { getProgramIcon, resolveIconKey } from '@/features/content/programs/core/program-icon.util';
import type { Program } from '@/features/content/programs/core/program.types';
import type { GearDefinition } from '@/features/content/equipment/gear/core/gear-definition.types';
import type { MuscleGroup } from '../../core/exercise.types';
import { resolveEquipmentSvgPathList } from '@/features/workout-engine/shared/utils/gear-mapping.utils';

const DEFAULT_MAX_LEVELS = 20;
const GRID_COLS = 5;

// Same physical-type → location-relevant bucketing EquipmentFilterSheet uses.
// Duplicated (not imported) on purpose — EquipmentFilterSheet is shared by
// 3 other flows (profile editor, onboarding, workout builder) with a
// different UI shape; re-exporting from it for this one sheet would widen
// that shared component's surface for no benefit to those other callers.
function isParkGear(g: GearDefinition): boolean {
  if (g.category === 'stationary') return true;
  if (!g.category && g.defaultLocation === 'park') return true;
  return false;
}
function isImprovisedGear(g: GearDefinition): boolean {
  return g.category === 'improvised';
}

/**
 * Hebrew name → domain slug, for the 4 core movement patterns — these exact
 * strings are already the canonical Hebrew label for each domain in many
 * other places in this codebase (program-icon.util.tsx's PROGRAM_ALIAS_TO_ICON
 * reverse, useExerciseMasterData.ts's PROGRAM_LABEL_FALLBACK, onboarding's
 * ProgramResult.tsx, etc.) — not invented here. Used as one of several
 * fallback candidates below, not the primary source.
 */
const HEBREW_DOMAIN_NAME_TO_SLUG: Record<string, string> = {
  'משיכה': 'pull',
  'דחיפה': 'push',
  'רגליים': 'legs',
  'פלג גוף תחתון': 'legs',
  'ליבה': 'core',
};

/**
 * Every plausible slug a program document might resolve to, most-reliable
 * first (round 7, #1 fix). A single-value resolution (round 5's
 * `programSlug`) broke for דחיפה even though it worked for משיכה — some
 * program docs simply don't have BOTH `slug` and `movementPattern`
 * populated consistently with each other (admin data-entry reality, not
 * verifiable from this environment — no Firestore credentials here). Rather
 * than guess which single field is reliable, every candidate gets tried:
 * domainsToChipIds safely ignores whichever ones don't match a real
 * PROG_TO_CHIPS key (via its own `individualIds` filter), so throwing in
 * extra guesses costs nothing and can only ever ADD a correct match, never
 * introduce a wrong one.
 */
function programSlugCandidates(program: Program): string[] {
  const candidates: string[] = [];
  if (program.slug) candidates.push(program.slug);
  if (program.movementPattern) candidates.push(program.movementPattern);
  const name = program.name.trim();
  const hebrewSlug = HEBREW_DOMAIN_NAME_TO_SLUG[name];
  if (hebrewSlug) candidates.push(hebrewSlug);
  candidates.push(name.toLowerCase().replace(/[\s-]+/g, '_'));
  return candidates;
}

interface Props {
  gear: GearDefinition[];
}

export default function SecondaryFiltersSheet({ gear }: Props) {
  const isOpen = useExerciseLibraryStore((s) => s.isSecondaryFiltersOpen);
  const setOpen = useExerciseLibraryStore((s) => s.setSecondaryFiltersOpen);
  const filters = useExerciseLibraryStore((s) => s.filters);
  const allExercises = useExerciseLibraryStore((s) => s.allExercises);
  const programs = useExerciseLibraryStore((s) => s.allPrograms);
  const setLevelsByProgram = useExerciseLibraryStore((s) => s.setLevelsByProgram);
  const setEquipmentIds = useExerciseLibraryStore((s) => s.setEquipmentIds);
  const setFilterLocation = useExerciseLibraryStore((s) => s.setFilterLocation);
  const setMuscles = useExerciseLibraryStore((s) => s.setMuscles);

  const [draftLevelsByProgram, setDraftLevelsByProgram] = useState<Record<string, number[]>>({});
  const [draftLocation, setDraftLocation] = useState<'home' | 'park' | null>(null);
  const [draftEquipment, setDraftEquipment] = useState<Set<string>>(new Set());
  // Pure UI state, not a filter — deliberately NOT re-seeded on open, so a
  // master the user expanded stays expanded across sheet close/reopen.
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(new Set());

  // Re-seed drafts from the committed store filters every time the sheet opens.
  useEffect(() => {
    if (!isOpen) return;
    setDraftLevelsByProgram(filters.levelsByProgram);
    setDraftLocation(filters.location === 'gym' ? null : filters.location);
    setDraftEquipment(new Set(filters.equipmentIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function toggleTrack(id: string) {
    setDraftLevelsByProgram((prev) => {
      if (id in prev) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: [] };
    });
  }
  function toggleTrackLevel(trackId: string, level: number) {
    setDraftLevelsByProgram((prev) => {
      const current = prev[trackId] ?? [];
      const nextLevels = current.includes(level)
        ? current.filter((l) => l !== level)
        : [...current, level];
      return { ...prev, [trackId]: nextLevels };
    });
  }
  function toggleExpand(masterId: string) {
    setExpandedMasters((prev) => {
      const next = new Set(prev);
      if (next.has(masterId)) next.delete(masterId);
      else next.add(masterId);
      return next;
    });
  }

  // ── מסלול hierarchy: master → its children (deduped across masters), plus
  // standalone tracks belonging to no master (round 5, #3) ──────────────
  const { masters, childrenByMaster, standalone } = useMemo(() => {
    const masterList = programs.filter((p) => p.isMaster);
    const childIdSet = new Set(masterList.flatMap((m) => m.subPrograms ?? []));
    const claimed = new Set<string>();
    const byMaster = new Map<string, Program[]>();
    for (const m of masterList) {
      const kids = (m.subPrograms ?? [])
        .filter((id) => !claimed.has(id))
        .map((id) => programs.find((p) => p.id === id))
        .filter((p): p is Program => !!p);
      kids.forEach((k) => claimed.add(k.id));
      byMaster.set(m.id, kids);
    }
    return {
      masters: masterList,
      childrenByMaster: byMaster,
      standalone: programs.filter((p) => !p.isMaster && !childIdSet.has(p.id)),
    };
  }, [programs]);

  const gearSections = useMemo(() => {
    const park: GearDefinition[] = [];
    const improvised: GearDefinition[] = [];
    const personal: GearDefinition[] = [];
    for (const g of gear) {
      if (isParkGear(g)) park.push(g);
      else if (isImprovisedGear(g)) improvised.push(g);
      else personal.push(g);
    }
    const cmp = (a: GearDefinition, b: GearDefinition) =>
      (a.name?.he || a.name?.en || a.id).localeCompare(b.name?.he || b.name?.en || b.id, 'he');
    return { park: park.sort(cmp), improvised: improvised.sort(cmp), personal: personal.sort(cmp) };
  }, [gear]);

  function toggleEquipment(id: string) {
    setDraftEquipment((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── שרירים associative highlight (round 5, #4 fix) — the CANONICAL
  // track↔muscle mapping (PROG_TO_CHIPS via domainsToChipIds), not derived
  // from which exercises happen to be tagged in Firestore today. Master
  // programs expand to their children first (resolveProgramMatchIds) so
  // their slugs get unioned in too.
  const associatedMuscles = useMemo(() => {
    const selectedTrackIds = Object.keys(draftLevelsByProgram);
    if (selectedTrackIds.length === 0) return new Set<MuscleGroup>();
    const slugs: string[] = [];
    for (const trackId of selectedTrackIds) {
      for (const id of resolveProgramMatchIds(trackId, programs)) {
        const p = programs.find((pr) => pr.id === id);
        if (p) slugs.push(...programSlugCandidates(p));
        else slugs.push(id);
      }
    }
    return new Set(domainsToChipIds(slugs) as MuscleGroup[]);
  }, [draftLevelsByProgram, programs]);

  // ── Live preview count — mirrors useExerciseLibraryFilters' matching
  // rules exactly (query + muscles stay at their committed values; tracks/
  // equipment/location use the draft so the count updates as the user
  // taps, before Apply commits anything). Shares exerciseMatchesTracks with
  // the real filter so the two rules can't drift apart.
  const previewCount = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    let count = 0;
    for (const ex of allExercises) {
      if (q) {
        const he = (ex.name?.he ?? '').toLowerCase();
        const en = (ex.name?.en ?? '').toLowerCase();
        if (!he.includes(q) && !en.includes(q)) continue;
      }
      if (filters.muscles.length > 0 && (!ex.primaryMuscle || !filters.muscles.includes(ex.primaryMuscle))) continue;
      if (!exerciseMatchesTracks(ex, draftLevelsByProgram, programs)) continue;
      if (draftEquipment.size > 0) {
        const wantsBW = draftEquipment.has(BODYWEIGHT_SENTINEL);
        const gearIds = Array.from(draftEquipment).filter((id) => id !== BODYWEIGHT_SENTINEL);
        const exGear = collectExerciseEquipmentIds(ex);
        const matchesBW = wantsBW && exGear.length === 0;
        const matchesGear = gearIds.length > 0 && gearIds.some((id) => exGear.includes(id));
        if (!matchesBW && !matchesGear) continue;
      }
      if (draftLocation && !exerciseHasLocationMethod(ex, draftLocation)) continue;
      count++;
    }
    return count;
  }, [allExercises, programs, filters.query, filters.muscles, draftLevelsByProgram, draftEquipment, draftLocation]);

  function handleApply() {
    setLevelsByProgram(draftLevelsByProgram);
    setFilterLocation(draftLocation);
    setEquipmentIds(Array.from(draftEquipment));
    setOpen(false);
  }

  const footer = (
    <div className="px-5 py-3 border-t border-gray-100 bg-white">
      <button
        type="button"
        onClick={handleApply}
        className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm"
        style={{ background: 'linear-gradient(90deg,#2CE0C0,#20C6D6 55%,#2AA3E8)' }}
      >
        הצג {previewCount} תרגילים
      </button>
    </div>
  );

  return (
    <FilterSheet isOpen={isOpen} title="פילטרים" onClose={() => setOpen(false)} footer={footer}>
      <div className="space-y-5">
        {/* ── שרירים — synced with the top bar (same store field, no draft),
             plus a secondary "associated with the selected track" hint ── */}
        <section>
          <h3 className="text-[13px] font-bold text-gray-700 mb-1">שרירים</h3>
          {associatedMuscles.size > 0 && (
            <p className="text-[11px] text-amber-600 font-semibold mb-2">
              מסומן בכתום — שרירים שקשורים למסלול שנבחר (מידע בלבד, לא משפיע על התוצאות)
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {MUSCLE_BAR_CHIPS.map((chip) => {
              const isOn = chipIsActive(filters.muscles, chip);
              const isAssociated = !isOn && chip.groups.some((g) => associatedMuscles.has(g));
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setMuscles(toggleMuscleChip(filters.muscles, chip))}
                  className={`flex items-center gap-1.5 ps-2.5 pe-3 py-1.5 rounded-full border text-xs font-bold transition-all ${
                    isOn
                      ? 'bg-primary/10 border-primary text-primary'
                      : isAssociated
                      ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={chip.icon}
                    alt=""
                    className="w-3.5 h-3.5 object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                    }}
                  />
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── מסלול — collapsible master → children hierarchy, per-track רמה
             nested inline (round 5, #3, #6, #8) ── */}
        <section>
          <h3 className="text-[13px] font-bold text-gray-700 mb-2">מסלול</h3>
          {programs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">טוען מסלולים...</p>
          ) : (
            <div className="space-y-2.5">
              {masters.map((master) => {
                const isSelected = master.id in draftLevelsByProgram;
                const kids = childrenByMaster.get(master.id) ?? [];
                const isExpanded = expandedMasters.has(master.id);
                return (
                  <div key={master.id}>
                    <div className="flex items-center gap-1">
                      <ProgramPill
                        program={master}
                        isOn={isSelected}
                        onClick={() => toggleTrack(master.id)}
                        emphasized
                      />
                      {kids.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(master.id)}
                          aria-label={isExpanded ? 'הסתר תת-מסלולים' : 'הצג תת-מסלולים'}
                          aria-expanded={isExpanded}
                          className="p-1.5 text-gray-400 hover:text-gray-600"
                        >
                          <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                    {isSelected && kids.length > 0 && (
                      <p className="mt-1 mb-1.5 text-[11px] text-gray-400">
                        כולל את כל הרמות של כל תת-המסלולים
                      </p>
                    )}
                    {isExpanded && kids.length > 0 && (
                      <div className="mt-1.5 me-4 pe-2 border-e-2 border-gray-100 space-y-2.5">
                        {kids.map((child) => {
                          const childOn = child.id in draftLevelsByProgram;
                          return (
                            <div key={child.id}>
                              <ProgramPill program={child} isOn={childOn} onClick={() => toggleTrack(child.id)} />
                              {childOn && (
                                <TrackLevelRow
                                  program={child}
                                  levels={draftLevelsByProgram[child.id]}
                                  onToggleLevel={(lvl) => toggleTrackLevel(child.id, lvl)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {standalone.length > 0 && (
                <div className="space-y-2.5">
                  {standalone.map((p) => {
                    const isOn = p.id in draftLevelsByProgram;
                    return (
                      <div key={p.id}>
                        <ProgramPill program={p} isOn={isOn} onClick={() => toggleTrack(p.id)} />
                        {isOn && (
                          <TrackLevelRow
                            program={p}
                            levels={draftLevelsByProgram[p.id]}
                            onToggleLevel={(lvl) => toggleTrackLevel(p.id, lvl)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── מיקום ── */}
        <section>
          <h3 className="text-[13px] font-bold text-gray-700 mb-2">מיקום</h3>
          <div className="flex gap-2">
            {(['park', 'home'] as const).map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setDraftLocation(draftLocation === loc ? null : loc)}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                  draftLocation === loc
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {loc === 'park' ? 'פארק' : 'בית'}
              </button>
            ))}
          </div>
        </section>

        {/* ── ציוד ── */}
        <section>
          <h3 className="text-[13px] font-bold text-gray-700 mb-2">ציוד</h3>
          <div className="flex flex-wrap gap-1.5 mb-3">
            <EquipmentChip
              active={draftEquipment.has(BODYWEIGHT_SENTINEL)}
              onClick={() => toggleEquipment(BODYWEIGHT_SENTINEL)}
              iconNode={<PersonStanding size={14} className="text-cyan-600" />}
              label="משקל גוף"
            />
          </div>
          {gear.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">טוען ציוד...</p>
          ) : (
            <div className="space-y-3">
              <GearSection title="ציוד פארק" items={gearSections.park} draft={draftEquipment} onToggle={toggleEquipment} />
              <GearSection title="ציוד מאולתר / ביתי" items={gearSections.improvised} draft={draftEquipment} onToggle={toggleEquipment} />
              <GearSection title="ציוד אישי" items={gearSections.personal} draft={draftEquipment} onToggle={toggleEquipment} />
            </div>
          )}
        </section>
      </div>
    </FilterSheet>
  );
}

function TrackLevelRow({
  program,
  levels,
  onToggleLevel,
}: {
  program: Program;
  levels: number[];
  onToggleLevel: (level: number) => void;
}) {
  const maxLevel = program.maxLevels ?? DEFAULT_MAX_LEVELS;
  const cells = useMemo(() => Array.from({ length: maxLevel }, (_, i) => i + 1), [maxLevel]);
  return (
    <div
      className="mt-2 mb-1 grid gap-2"
      style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
    >
      {cells.map((lvl) => {
        const isOn = levels.includes(lvl);
        return (
          <button
            key={lvl}
            type="button"
            onClick={() => onToggleLevel(lvl)}
            className={`h-10 rounded-xl text-sm font-bold transition-all active:scale-95 ${
              isOn
                ? 'text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
            style={isOn ? { background: 'linear-gradient(135deg, #2CE0C0, #20C6D6)' } : undefined}
          >
            {lvl}
          </button>
        );
      })}
    </div>
  );
}

function ProgramPill({
  program,
  isOn,
  onClick,
  emphasized = false,
}: {
  program: Program;
  isOn: boolean;
  onClick: () => void;
  emphasized?: boolean;
}) {
  const iconKey = resolveIconKey(program.iconKey, program.name);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-0 flex items-center gap-1.5 ps-2.5 pe-3 py-1.5 rounded-full border text-xs transition-all ${
        emphasized ? 'font-extrabold' : 'font-bold'
      } ${
        isOn
          ? 'bg-primary/10 border-primary text-primary'
          : emphasized
          ? 'bg-gray-50 border-gray-300 text-gray-800'
          : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
      }`}
    >
      {getProgramIcon(iconKey, 'w-3.5 h-3.5 flex-shrink-0')}
      <span className="truncate">{program.name}</span>
    </button>
  );
}

function GearSection({
  title,
  items,
  draft,
  onToggle,
}: {
  title: string;
  items: GearDefinition[];
  draft: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((g) => {
          const label = g.name?.he || g.name?.en || g.id;
          const iconSrc = resolveEquipmentSvgPathList(g.id)[0] ?? null;
          return (
            <EquipmentChip key={g.id} active={draft.has(g.id)} onClick={() => onToggle(g.id)} iconSrc={iconSrc} label={label} />
          );
        })}
      </div>
    </div>
  );
}

function EquipmentChip({
  active,
  onClick,
  iconSrc,
  iconNode,
  label,
}: {
  active: boolean;
  onClick: () => void;
  iconSrc?: string | null;
  iconNode?: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 ps-2.5 pe-3 py-1.5 rounded-full border text-xs font-bold transition-all ${
        active ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
      }`}
    >
      {iconNode ?? (iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconSrc}
          alt=""
          width={14}
          height={14}
          className="object-contain flex-shrink-0"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full bg-gray-100 flex-shrink-0" />
      ))}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
