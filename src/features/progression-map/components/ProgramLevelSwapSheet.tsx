'use client';

/**
 * ProgramLevelSwapSheet — the sheet opened by a Tree node's 🔄 swap pill.
 *
 * A new, lighter sheet — NOT a 3rd tab bolted onto ExerciseReplacementModal.
 * Reuses that modal's proven visual atoms (LazyExerciseImage-equivalent,
 * gear badges, the select-then-confirm card-row interaction) but not its
 * fetch pipeline: both of the modal's existing tabs cap results at 3
 * (smartSelect3) and bucket by lower/same/higher relative level — wrong
 * shape here, since getSameProgramLevelExercises returns the TRUE full
 * sibling list and every candidate is the same level by construction.
 *
 * Interaction (revised per founder correction — the first pass was a
 * read-only browsing list with no action): tap a card to SELECT it
 * (highlight), then confirm via the sticky bottom button — same two-step
 * shape as ExerciseReplacementModal's "החליפו תרגיל", not a single-tap
 * navigate. Confirming calls onReplace(exercise), which the caller
 * (SkillTreeScreen) uses to swap which exercise is shown as THIS level's
 * representative on the tree — a session-local override, not persisted to
 * Firestore (no new data model / admin content, consistent with the whole
 * feature's scope).
 */
import { useEffect, useState } from 'react';
import { X, Dumbbell } from 'lucide-react';
import { getLocalizedText, resolveImageForLocation, ExecutionLocation, type Exercise } from '@/features/content/exercises';
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

function SwapCard({
  option,
  location,
  selected,
  onTap,
}: {
  option: SameLevelExerciseOption;
  location: string | null;
  selected: boolean;
  onTap: () => void;
}) {
  const name = getLocalizedText(option.exercise.name, 'he');
  const imageUrl = resolveImageForLocation(option.exercise, location) || '/images/park-placeholder.svg';
  const method = option.selectedExecutionMethod;
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
      className={`w-full bg-white p-4 rounded-3xl flex items-center gap-5 shadow-sm transition-all active:scale-[0.98] text-right ${
        selected ? 'border-2 border-[#00BAF7]' : 'border border-slate-100'
      }`}
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
  onReplace: (exercise: Exercise) => void;
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
  onReplace,
}: ProgramLevelSwapSheetProps) {
  const allExercises = useExerciseLibraryStore((s) => s.allExercises);
  const [options, setOptions] = useState<SameLevelExerciseOption[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setOptions(null);
    setSelectedId(null);
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

  const selectedOption = options?.find((o) => o.exercise.id === selectedId) ?? null;

  const handleConfirm = () => {
    if (!selectedOption) return;
    onReplace(selectedOption.exercise);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70]" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl overflow-y-auto flex flex-col"
        style={{ maxHeight: '80vh' }}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-black text-gray-900">גם ברמה הזו</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
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
              selected={option.exercise.id === selectedId}
              onTap={() => setSelectedId(option.exercise.id)}
            />
          ))}
        </div>

        {options !== null && options.length > 0 && (
          <div
            className="flex-shrink-0 px-5 pt-4 bg-gradient-to-t from-white via-white/95 to-transparent"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 24px))' }}
          >
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedOption}
              className={`w-full font-semibold py-3.5 rounded-full text-base shadow-lg transition-all ${
                selectedOption
                  ? 'text-black active:scale-[0.98]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              style={selectedOption ? { background: 'linear-gradient(135deg, #2CE0C0 0%, #20C6D6 50%, #2AA3E8 100%)' } : undefined}
            >
              החלף לתרגיל זה
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
