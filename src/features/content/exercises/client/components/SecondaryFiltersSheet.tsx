'use client';

/**
 * SecondaryFiltersSheet — the funnel-icon bottom sheet.
 *
 * Merges what used to be two separate sheets (ProgressionFilterSheet +
 * EquipmentFilterSheet in 'filter' mode) into one: מסלול, רמה, מיקום, ציוד,
 * plus שרירים (kept here for AND-combination transparency with the top bar).
 * Open/close state lives in the store (isSecondaryFiltersOpen) because the
 * trigger button sits in /search's AppHeader — a different subtree from
 * this sheet, which is rendered inside the embedded exercises-tab body.
 *
 * מיקום and ציוד are independent selections (no location→gear auto-fill
 * preset) — the redesigned funnel sheet presents all dimensions as flat,
 * separate panels; the old EquipmentFilterSheet preset-shortcut framing
 * doesn't carry over to this layout. מיקום also filters the result set
 * (round 2, #7 — exact/locationMapping match only), not just card media.
 *
 * מסלול + רמה are multi-select unions (round 4, #6), same toggle pattern as
 * שרירים. מסלול is grouped parent→children (round 4, #8): a master program
 * (Program.isMaster) is rendered with its subPrograms indented beneath it,
 * mirroring the admin panel's own program hierarchy instead of one flat
 * list. Selecting a master alone still matches its children's exercises
 * (round 4, #7 — see resolveProgramMatchIds in useExerciseLibraryFilters).
 *
 * `programs`/`gear` are fetched once by the parent (ExerciseLibraryPage)
 * and passed down so this sheet and ActiveFilterChipsRow don't each
 * re-fetch the same catalogs.
 *
 * The "שרירים" section reads/writes `filters.muscles` directly (no draft —
 * unlike the other sections) so it stays truly two-way-synced with the
 * always-visible top MuscleFilterBar in real time: they're both just views
 * onto the same store field, sharing MUSCLE_BAR_CHIPS from
 * muscle-bar.utils.ts. It ALSO highlights, in a visually distinct secondary
 * style, the muscles associated with the currently draft-selected track(s)
 * (round 4, #5) — purely informational (computed from which exercises are
 * tagged to those tracks, primary-muscle-only per #4), never added to the
 * actual filter or changing results. Muscle + track combine as AND
 * (unchanged) — this section exists to make that combination visible, not
 * to change it, so a "0 results" combo reads as "these two narrow each
 * other out" instead of looking like the sheet silently deleted everything.
 */

import { useEffect, useMemo, useState } from 'react';
import FilterSheet from './FilterSheet';
import {
  useExerciseLibraryStore,
  BODYWEIGHT_SENTINEL,
} from '../store/useExerciseLibraryStore';
import {
  resolveExerciseLevel,
  resolveProgramMatchIds,
  collectExerciseProgramIds,
  collectExerciseEquipmentIds,
  exerciseHasLocationMethod,
} from '../hooks/useExerciseLibraryFilters';
import { MUSCLE_BAR_CHIPS, chipIsActive, toggleMuscleChip } from '../utils/muscle-bar.utils';
import { getProgramIcon, resolveIconKey } from '@/features/content/programs/core/program-icon.util';
import type { Program } from '@/features/content/programs/core/program.types';
import type { GearDefinition } from '@/features/content/equipment/gear/core/gear-definition.types';
import type { MuscleGroup } from '../../core/exercise.types';
import { resolveEquipmentSvgPathList } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { PersonStanding } from 'lucide-react';

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

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
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
  const setProgramIds = useExerciseLibraryStore((s) => s.setProgramIds);
  const setLevels = useExerciseLibraryStore((s) => s.setLevels);
  const setEquipmentIds = useExerciseLibraryStore((s) => s.setEquipmentIds);
  const setFilterLocation = useExerciseLibraryStore((s) => s.setFilterLocation);
  const setMuscles = useExerciseLibraryStore((s) => s.setMuscles);

  const [draftProgramIds, setDraftProgramIds] = useState<string[]>([]);
  const [draftLevels, setDraftLevels] = useState<number[]>([]);
  const [draftLocation, setDraftLocation] = useState<'home' | 'park' | null>(null);
  const [draftEquipment, setDraftEquipment] = useState<Set<string>>(new Set());

  // Re-seed drafts from the committed store filters every time the sheet opens.
  useEffect(() => {
    if (!isOpen) return;
    setDraftProgramIds(filters.programIds);
    setDraftLevels(filters.levels);
    setDraftLocation(filters.location === 'gym' ? null : filters.location);
    setDraftEquipment(new Set(filters.equipmentIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── מסלול hierarchy: master → its children, plus standalone tracks ─────
  const { masters, childrenByMaster, standalone } = useMemo(() => {
    const masterList = programs.filter((p) => p.isMaster);
    const childIdSet = new Set(masterList.flatMap((m) => m.subPrograms ?? []));
    const byMaster = new Map<string, Program[]>();
    for (const m of masterList) {
      byMaster.set(m.id, programs.filter((p) => m.subPrograms?.includes(p.id)));
    }
    return {
      masters: masterList,
      childrenByMaster: byMaster,
      standalone: programs.filter((p) => !p.isMaster && !childIdSet.has(p.id)),
    };
  }, [programs]);

  function toggleProgram(id: string) {
    setDraftProgramIds((prev) => {
      const next = toggleInArray(prev, id);
      // Level only has meaning inside a program — drop the draft levels once
      // every program is deselected (mirrors the store's setProgramIds).
      if (next.length === 0) setDraftLevels([]);
      return next;
    });
  }
  function toggleLevel(level: number) {
    setDraftLevels((prev) => toggleInArray(prev, level));
  }

  const maxLevel = useMemo(() => {
    if (draftProgramIds.length === 0) return DEFAULT_MAX_LEVELS;
    const selected = programs.filter((p) => draftProgramIds.includes(p.id));
    const maxes = selected.map((p) => p.maxLevels ?? DEFAULT_MAX_LEVELS);
    return maxes.length > 0 ? Math.max(...maxes) : DEFAULT_MAX_LEVELS;
  }, [draftProgramIds, programs]);

  const levelCells = useMemo(
    () => Array.from({ length: maxLevel }, (_, i) => i + 1),
    [maxLevel],
  );

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

  // ── שרירים associative highlight (round 4, #5) — muscles that appear as
  // the PRIMARY muscle (matching #4's primary-only rule) among exercises
  // tagged to the draft-selected track(s), master-expanded like the real
  // filter. Purely informational: never written to filters.muscles.
  const associatedMuscles = useMemo(() => {
    const result = new Set<MuscleGroup>();
    if (draftProgramIds.length === 0) return result;
    const allowedIds = new Set<string>();
    for (const pid of draftProgramIds) {
      for (const id of resolveProgramMatchIds(pid, programs)) allowedIds.add(id);
    }
    for (const ex of allExercises) {
      if (!ex.primaryMuscle) continue;
      const exProgs = collectExerciseProgramIds(ex);
      if (exProgs.some((id) => allowedIds.has(id))) result.add(ex.primaryMuscle);
    }
    return result;
  }, [draftProgramIds, programs, allExercises]);

  // ── Live preview count — mirrors useExerciseLibraryFilters' matching
  // rules exactly (query stays committed; muscles/program/level/equipment/
  // location use the draft so the count updates as the user taps, before
  // Apply commits anything). Primary-muscle-only (#4) and master-expansion
  // (#7), same as the real filter.
  const previewCount = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const allowedProgramIds = new Set<string>();
    for (const pid of draftProgramIds) {
      for (const id of resolveProgramMatchIds(pid, programs)) allowedProgramIds.add(id);
    }
    let count = 0;
    for (const ex of allExercises) {
      if (q) {
        const he = (ex.name?.he ?? '').toLowerCase();
        const en = (ex.name?.en ?? '').toLowerCase();
        if (!he.includes(q) && !en.includes(q)) continue;
      }
      if (filters.muscles.length > 0 && (!ex.primaryMuscle || !filters.muscles.includes(ex.primaryMuscle))) continue;
      if (draftProgramIds.length > 0) {
        const exProgs = collectExerciseProgramIds(ex);
        const matchedIds = exProgs.filter((id) => allowedProgramIds.has(id));
        if (matchedIds.length === 0) continue;
        if (draftLevels.length > 0) {
          const levelMatch = matchedIds.some((id) => {
            const tp = ex.targetPrograms?.find((t) => t.programId === id);
            const lvl = tp?.level ?? resolveExerciseLevel(ex);
            return draftLevels.includes(lvl);
          });
          if (!levelMatch) continue;
        }
      }
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
  }, [allExercises, programs, filters.query, filters.muscles, draftProgramIds, draftLevels, draftEquipment, draftLocation]);

  function handleApply() {
    setProgramIds(draftProgramIds);
    setLevels(draftLevels);
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
          {draftProgramIds.length > 0 && associatedMuscles.size > 0 && (
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

        {/* ── מסלול — master → children hierarchy (round 4, #8) ── */}
        <section>
          <h3 className="text-[13px] font-bold text-gray-700 mb-2">מסלול</h3>
          {programs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">טוען מסלולים...</p>
          ) : (
            <div className="space-y-3">
              {masters.map((master) => (
                <div key={master.id}>
                  <ProgramPill
                    program={master}
                    isOn={draftProgramIds.includes(master.id)}
                    onClick={() => toggleProgram(master.id)}
                    emphasized
                  />
                  {(childrenByMaster.get(master.id)?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1.5 me-4 pe-2 border-e-2 border-gray-100">
                      {childrenByMaster.get(master.id)!.map((child) => (
                        <ProgramPill
                          key={child.id}
                          program={child}
                          isOn={draftProgramIds.includes(child.id)}
                          onClick={() => toggleProgram(child.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {standalone.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {standalone.map((p) => (
                    <ProgramPill
                      key={p.id}
                      program={p}
                      isOn={draftProgramIds.includes(p.id)}
                      onClick={() => toggleProgram(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── רמה — multi-select (round 4, #6) ── */}
        <section>
          <h3 className="text-[13px] font-bold text-gray-700 mb-2">רמה</h3>
          {draftProgramIds.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 px-4 py-6 text-center">
              <p className="text-sm text-gray-400 font-medium">בחר מסלול כדי לראות את הרמות</p>
            </div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}>
              {levelCells.map((lvl) => {
                const isOn = draftLevels.includes(lvl);
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => toggleLevel(lvl)}
                    className={`h-11 rounded-xl text-sm font-bold transition-all ${
                      isOn ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={isOn ? { backgroundColor: '#00dcd0' } : undefined}
                  >
                    {lvl}
                  </button>
                );
              })}
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
      className={`flex items-center gap-1.5 ps-2.5 pe-3 py-1.5 rounded-full border text-xs transition-all ${
        emphasized ? 'font-extrabold' : 'font-bold'
      } ${
        isOn
          ? 'bg-primary/10 border-primary text-primary'
          : emphasized
          ? 'bg-gray-50 border-gray-300 text-gray-800'
          : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
      }`}
    >
      {getProgramIcon(iconKey, 'w-3.5 h-3.5')}
      <span>{program.name}</span>
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
