'use client';

/**
 * ProgramLevelSwapSheet — the sheet opened by a Tree node's 🔄 swap pill.
 *
 * A new, lighter sheet — NOT a 3rd tab bolted onto ExerciseReplacementModal.
 * Reuses that modal's proven visual atoms (LazyExerciseImage, DrawerGearBadge,
 * the card-row layout) but not its fetch pipeline: both of the modal's
 * existing tabs cap results at 3 (smartSelect3) and bucket by lower/same/
 * higher relative level — wrong shape here, since getSameProgramLevelExercises
 * returns the TRUE full sibling list and every candidate is the same level by
 * construction. The level-trend icon+"רמה X" line from the original card row
 * is deliberately dropped when porting — it would show an uninformative
 * "same" badge on every single card in this context.
 *
 * Tapping a card opens that exercise's own detail sheet (reuses the existing
 * global ExerciseDetailSheet via useExerciseLibraryStore.openDetail) — there
 * is no "replace in an active workout" concept here, unlike the original
 * modal; this sheet is a browsing surface for "what else is at this level."
 */
import { useEffect, useState } from 'react';
import { X, Dumbbell } from 'lucide-react';
import { getLocalizedText, resolveImageForLocation, ExecutionLocation } from '@/features/content/exercises';
import { UserFullProfile } from '@/types/user-profile';
import { Park } from '@/types/admin-types';
import { useExerciseLibraryStore } from '@/features/content/exercises/client/store/useExerciseLibraryStore';
import { resolveEquipmentLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import {
  getSameProgramLevelExercises,
  type SameLevelExerciseOption,
} from '../services/program-level-swap-query';

function GearBadge({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-1.5 bg-white/90 shadow-sm"
      style={{ borderRadius: 8, border: '1.5px solid #E0E9FF', padding: '4px 8px' }}
    >
      <Dumbbell className="text-gray-400 flex-shrink-0" style={{ width: 16, height: 16 }} />
      <span className="text-[10px] font-medium text-slate-600 whitespace-nowrap leading-none">{label}</span>
    </div>
  );
}

function SwapCard({ option, location, onTap }: { option: SameLevelExerciseOption; location: string | null; onTap: () => void }) {
  const name = getLocalizedText(option.exercise.name, 'he');
  const imageUrl = resolveImageForLocation(option.exercise, location) || '/images/park-placeholder.svg';
  const method = option.selectedExecutionMethod;
  // Same combination ExerciseReplacementModal's resolveGearBadges uses — gearIds
  // (user_gear/improvised) + equipmentIds (fixed_equipment) + legacy single gearId.
  const rawGearIds: string[] = [
    ...(method.gearIds ?? []),
    ...(method.equipmentIds ?? []),
    ...(method.gearId ? [method.gearId] : []),
  ].filter(Boolean);
  const gearLabels = Array.from(new Set(rawGearIds.map((id) => resolveEquipmentLabel(id))));

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full bg-white p-4 rounded-3xl flex items-center gap-5 shadow-sm border border-slate-100 active:scale-[0.98] transition-all text-right"
    >
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
      </div>
      <div className="flex-1 flex flex-col gap-1.5 items-start">
        <h3 className="font-bold text-base text-slate-900 w-full">{name}</h3>
        {gearLabels.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {gearLabels.slice(0, 3).map((label) => (
              <GearBadge key={label} label={label} />
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

export interface ProgramLevelSwapSheetProps {
  isOpen: boolean;
  onClose: () => void;
  programId: string;
  level: number;
  excludeExerciseId: string;
  location: ExecutionLocation;
  park: Park | null;
  userProfile: UserFullProfile;
}

export function ProgramLevelSwapSheet({
  isOpen,
  onClose,
  programId,
  level,
  excludeExerciseId,
  location,
  park,
  userProfile,
}: ProgramLevelSwapSheetProps) {
  const allExercises = useExerciseLibraryStore((s) => s.allExercises);
  const openDetail = useExerciseLibraryStore((s) => s.openDetail);
  const [options, setOptions] = useState<SameLevelExerciseOption[] | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setOptions(null);
    getSameProgramLevelExercises(programId, level, excludeExerciseId, location, park, userProfile, allExercises)
      .then((result) => {
        if (!cancelled) setOptions(result);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
    // allExercises intentionally omitted — it's a pass-through pool snapshot at open time, not a live dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, programId, level, excludeExerciseId, location, park, userProfile]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70]" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl overflow-y-auto"
        style={{ maxHeight: '80vh', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-4 border-b border-gray-100">
          <h2 className="text-base font-black text-gray-900">גם ברמה הזו</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {options === null && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-24 rounded-3xl bg-slate-100" />
              ))}
            </div>
          )}
          {options !== null && options.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">אין תרגילים נוספים ברמה הזו כרגע.</p>
          )}
          {options?.map((option) => (
            <SwapCard
              key={option.exercise.id}
              option={option}
              location={location}
              onTap={() => {
                openDetail(option.exercise);
                onClose();
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
