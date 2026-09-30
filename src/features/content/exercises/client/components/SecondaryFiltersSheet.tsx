'use client';

/**
 * SecondaryFiltersSheet — the funnel-icon bottom sheet (v2 redesign).
 *
 * Merges what used to be two separate sheets (ProgressionFilterSheet +
 * EquipmentFilterSheet in 'filter' mode) into one: מסלול, רמה, מיקום, ציוד.
 * Open/close state lives in the store (isSecondaryFiltersOpen) because the
 * trigger button sits in /search's AppHeader — a different subtree from
 * this sheet, which is rendered inside the embedded exercises-tab body.
 *
 * Unlike the old EquipmentFilterSheet, מיקום and ציוד are independent
 * selections here (no location→gear auto-fill preset) — the redesigned
 * funnel sheet presents all 4 dimensions as flat, separate panels; the old
 * preset-shortcut framing doesn't carry over to this layout. מיקום still
 * only affects which execution-method media a card shows (see
 * useExerciseLibraryStore's `location` doc comment) — it has never filtered
 * the result set, and that hasn't changed here.
 *
 * `programs`/`gear` are fetched once by the parent (ExerciseLibraryPage)
 * and passed down so this sheet and ActiveFilterChipsRow don't each
 * re-fetch the same catalogs.
 */

import { useEffect, useMemo, useState } from 'react';
import FilterSheet from './FilterSheet';
import {
  useExerciseLibraryStore,
  BODYWEIGHT_SENTINEL,
} from '../store/useExerciseLibraryStore';
import {
  resolveExerciseLevel,
  collectExerciseProgramIds,
  collectExerciseEquipmentIds,
} from '../hooks/useExerciseLibraryFilters';
import { getProgramIcon, resolveIconKey } from '@/features/content/programs/core/program-icon.util';
import type { Program } from '@/features/content/programs/core/program.types';
import type { GearDefinition } from '@/features/content/equipment/gear/core/gear-definition.types';
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

interface Props {
  programs: Program[];
  gear: GearDefinition[];
}

export default function SecondaryFiltersSheet({ programs, gear }: Props) {
  const isOpen = useExerciseLibraryStore((s) => s.isSecondaryFiltersOpen);
  const setOpen = useExerciseLibraryStore((s) => s.setSecondaryFiltersOpen);
  const filters = useExerciseLibraryStore((s) => s.filters);
  const allExercises = useExerciseLibraryStore((s) => s.allExercises);
  const setProgressionFilter = useExerciseLibraryStore((s) => s.setProgressionFilter);
  const setEquipmentIds = useExerciseLibraryStore((s) => s.setEquipmentIds);
  const setFilterLocation = useExerciseLibraryStore((s) => s.setFilterLocation);

  const [draftProgramId, setDraftProgramId] = useState<string | null>(null);
  const [draftLevel, setDraftLevel] = useState<number | null>(null);
  const [draftLocation, setDraftLocation] = useState<'home' | 'park' | null>(null);
  const [draftEquipment, setDraftEquipment] = useState<Set<string>>(new Set());

  // Re-seed drafts from the committed store filters every time the sheet opens.
  useEffect(() => {
    if (!isOpen) return;
    setDraftProgramId(filters.programId);
    setDraftLevel(filters.level);
    setDraftLocation(filters.location === 'gym' ? null : filters.location);
    setDraftEquipment(new Set(filters.equipmentIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === draftProgramId) ?? null,
    [programs, draftProgramId],
  );
  const maxLevel = selectedProgram?.maxLevels ?? DEFAULT_MAX_LEVELS;

  const levelCells = useMemo(() => {
    const cells: Array<{ id: string; label: string; value: number | null }> = [
      { id: 'all', label: 'הכל', value: null },
    ];
    for (let i = 1; i <= maxLevel; i++) cells.push({ id: `lvl-${i}`, label: String(i), value: i });
    return cells;
  }, [maxLevel]);

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

  function selectProgram(p: Program) {
    if (draftProgramId === p.id) {
      setDraftProgramId(null);
      setDraftLevel(null);
      return;
    }
    setDraftProgramId(p.id);
    const newMax = p.maxLevels ?? DEFAULT_MAX_LEVELS;
    if (draftLevel != null && draftLevel > newMax) setDraftLevel(null);
  }

  // ── Live preview count — mirrors useExerciseLibraryFilters' matching
  // rules exactly (query + muscles stay at their committed values; program/
  // level/equipment use the draft so the count updates as the user taps,
  // before Apply commits anything). Location is intentionally excluded —
  // it has never affected the result set, only card media.
  const previewCount = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    let count = 0;
    for (const ex of allExercises) {
      if (q) {
        const he = (ex.name?.he ?? '').toLowerCase();
        const en = (ex.name?.en ?? '').toLowerCase();
        if (!he.includes(q) && !en.includes(q)) continue;
      }
      if (filters.muscles.length > 0) {
        const set = new Set<string>();
        if (ex.primaryMuscle) set.add(ex.primaryMuscle);
        ex.secondaryMuscles?.forEach((m) => set.add(m));
        ex.muscleGroups?.forEach((m) => set.add(m));
        if (!filters.muscles.some((m) => set.has(m))) continue;
      }
      if (draftProgramId) {
        if (!collectExerciseProgramIds(ex).includes(draftProgramId)) continue;
        if (draftLevel != null) {
          const tp = ex.targetPrograms?.find((t) => t.programId === draftProgramId);
          const lvl = tp?.level ?? resolveExerciseLevel(ex);
          if (lvl !== draftLevel) continue;
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
      count++;
    }
    return count;
  }, [allExercises, filters.query, filters.muscles, draftProgramId, draftLevel, draftEquipment]);

  function handleApply() {
    setProgressionFilter(draftProgramId, draftLevel);
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
        {/* ── מסלול ── */}
        <section>
          <h3 className="text-[13px] font-bold text-gray-700 mb-2">מסלול</h3>
          {programs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">טוען מסלולים...</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {programs.map((p) => {
                const isOn = draftProgramId === p.id;
                const iconKey = resolveIconKey(p.iconKey, p.name);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectProgram(p)}
                    className={`flex items-center gap-1.5 ps-2.5 pe-3 py-1.5 rounded-full border text-xs font-bold transition-all ${
                      isOn
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {getProgramIcon(iconKey, 'w-3.5 h-3.5')}
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ── רמה ── */}
        <section>
          <h3 className="text-[13px] font-bold text-gray-700 mb-2">רמה</h3>
          {!selectedProgram ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 px-4 py-6 text-center">
              <p className="text-sm text-gray-400 font-medium">בחר מסלול כדי לראות את הרמות</p>
            </div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}>
              {levelCells.map((cell) => {
                const isOn = cell.value === null ? draftLevel === null : draftLevel === cell.value;
                return (
                  <button
                    key={cell.id}
                    type="button"
                    onClick={() => setDraftLevel(cell.value)}
                    className={`h-11 rounded-xl text-sm font-bold transition-all ${
                      isOn ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={isOn ? { backgroundColor: '#00dcd0' } : undefined}
                  >
                    {cell.label}
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
