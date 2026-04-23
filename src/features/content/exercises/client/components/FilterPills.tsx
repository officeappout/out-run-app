'use client';

/**
 * FilterPills — three pill buttons [שרירים | מסלול ורמה | ציוד] that open
 * the corresponding bottom sheet. Active pills show a count or short summary.
 *
 * The previous separate "רמה" and "תוכניות" pills were merged into a single
 * "מסלול ורמה" pill (see ProgressionFilterSheet) because a level only has
 * meaning inside a program context.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import FilterSheet from './FilterSheet';
import ProgressionFilterSheet from './ProgressionFilterSheet';
import EquipmentFilterSheet from './EquipmentFilterSheet';
import {
  useExerciseLibraryStore,
  BODYWEIGHT_SENTINEL,
} from '../store/useExerciseLibraryStore';
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '../../core/exercise.types';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import type { Program } from '@/features/content/programs/core/program.types';

type ActiveSheet = 'muscle' | 'progression' | 'equipment' | null;

const PRIMARY_MUSCLES: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'core',
  'abs',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
  'full_body',
  'cardio',
];

function muscleIconPath(m: MuscleGroup): string {
  return `/icons/muscles/male/${m}.svg`;
}

export default function FilterPills() {
  const filters = useExerciseLibraryStore((s) => s.filters);
  const setMuscles = useExerciseLibraryStore((s) => s.setMuscles);

  const [active, setActive] = useState<ActiveSheet>(null);

  // Programs are loaded here (not just inside ProgressionFilterSheet) so the
  // pill summary text can resolve a program ID → human name without waiting
  // for the sheet to mount.
  const [programs, setPrograms] = useState<Program[]>([]);
  useEffect(() => {
    if (filters.programId && programs.length === 0) {
      getAllPrograms().then(setPrograms).catch(() => {});
    }
  }, [filters.programId, programs.length]);

  // Local draft state for the muscle sheet (equipment uses its own dedicated
  // EquipmentFilterSheet which manages its own draft).
  const [draftMuscles, setDraftMuscles] = useState<MuscleGroup[]>([]);
  useEffect(() => {
    if (active === 'muscle') setDraftMuscles(filters.muscles);
  }, [active, filters.muscles]);

  const muscleItems = useMemo(
    () =>
      PRIMARY_MUSCLES.map((m) => ({
        id: m,
        label: MUSCLE_GROUP_LABELS[m]?.he ?? m,
        icon: muscleIconPath(m),
      })),
    [],
  );

  // ── Progression pill: human-readable summary of the active selection ──
  const progressionSummary = useMemo(() => {
    if (!filters.programId) return 'מסלול ורמה';
    const program = programs.find((p) => p.id === filters.programId);
    const name = program?.name ?? 'מסלול';
    if (filters.level == null) return name;
    return `${name}, רמה ${filters.level}`;
  }, [filters.programId, filters.level, programs]);

  const progressionActive = filters.programId != null;

  // Equipment pill: count real gear chips (the bodyweight sentinel is a
  // pseudo-toggle, not gear). Total chips drive `active`; the badge shows
  // the real-gear count so it stays meaningful (e.g. "1 + bodyweight" reads
  // as "1" on the pill).
  const equipmentRealCount = filters.equipmentIds.filter(
    (id) => id !== BODYWEIGHT_SENTINEL,
  ).length;
  const equipmentActive = filters.equipmentIds.length > 0;

  return (
    <>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4" dir="rtl">
        {/* ── Muscles ── */}
        <Pill
          label="שרירים"
          active={filters.muscles.length > 0}
          count={filters.muscles.length}
          onClick={() => setActive('muscle')}
        />
        {/* ── Program + Level (merged) ── */}
        <Pill
          label={progressionSummary}
          active={progressionActive}
          onClick={() => setActive('progression')}
        />
        {/* ── Equipment + Location ── */}
        <Pill
          label="ציוד ומיקום"
          active={equipmentActive}
          count={equipmentRealCount > 0 ? equipmentRealCount : undefined}
          onClick={() => setActive('equipment')}
        />
      </div>

      {/* Muscles sheet */}
      <FilterSheet
        isOpen={active === 'muscle'}
        title="קבוצות שרירים"
        onClose={() => setActive(null)}
        onClear={() => {
          setDraftMuscles([]);
          setMuscles([]);
          setActive(null);
        }}
        onApply={() => {
          setMuscles(draftMuscles);
          setActive(null);
        }}
      >
        <div className="grid grid-cols-3 gap-3">
          {muscleItems.map((m) => {
            const isOn = draftMuscles.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() =>
                  setDraftMuscles((prev) =>
                    prev.includes(m.id)
                      ? prev.filter((id) => id !== m.id)
                      : [...prev, m.id],
                  )
                }
                className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl border-2 transition-all ${
                  isOn
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.icon}
                  alt=""
                  className="w-8 h-8 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
                <span className="text-[10px] font-semibold text-center leading-tight">
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
      </FilterSheet>

      {/* Progression (Program + Level) sheet */}
      <ProgressionFilterSheet
        isOpen={active === 'progression'}
        onClose={() => setActive(null)}
      />

      {/* Equipment + Location (Smart presets sheet) */}
      <EquipmentFilterSheet
        isOpen={active === 'equipment'}
        onClose={() => setActive(null)}
      />
    </>
  );
}

function Pill({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${
        active
          ? 'bg-primary/10 border-primary text-primary'
          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
      }`}
    >
      <span>{label}</span>
      {count != null && count > 0 && (
        <span className="bg-primary text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
          {count}
        </span>
      )}
      <ChevronDown size={12} />
    </button>
  );
}
