'use client';

import { 
  ExerciseFormData, 
  MuscleGroup,
  MUSCLE_GROUP_LABELS,
} from '../../../core/exercise.types';
import { Target, Check, X } from 'lucide-react';

interface MuscleSelectionSectionProps {
  formData: ExerciseFormData;
  setFormData: React.Dispatch<React.SetStateAction<ExerciseFormData>> | ((data: ExerciseFormData | ((prev: ExerciseFormData) => ExerciseFormData)) => void);
  noContainer?: boolean; // When wrapped by CollapsibleSection, hide internal container
}

const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'abs', 'obliques', 'forearms',
  'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves',
  'traps', 'core', 'legs', 'full_body', 'cardio',
];

export default function MuscleSelectionSection({
  formData,
  setFormData,
  noContainer = false,
}: MuscleSelectionSectionProps) {

  const handlePrimaryMuscleChange = (muscle: MuscleGroup | '') => {
    setFormData((prev: ExerciseFormData) => ({
      ...prev,
      primaryMuscle: muscle || undefined,
      // If the selected primary was in secondary, remove it
      secondaryMuscles: muscle 
        ? (prev.secondaryMuscles || []).filter((m) => m !== muscle)
        : prev.secondaryMuscles,
    }));
  };

  const toggleSecondaryMuscle = (muscle: MuscleGroup) => {
    // Don't allow selecting the primary muscle as secondary
    if (muscle === formData.primaryMuscle) return;
    
    setFormData((prev: ExerciseFormData) => {
      const currentSecondary = prev.secondaryMuscles || [];
      const newSecondary = currentSecondary.includes(muscle)
        ? currentSecondary.filter((m) => m !== muscle)
        : [...currentSecondary, muscle];
      return {
        ...prev,
        secondaryMuscles: newSecondary,
      };
    });
  };

  const removeSecondaryMuscle = (muscle: MuscleGroup) => {
    setFormData((prev: ExerciseFormData) => ({
      ...prev,
      secondaryMuscles: (prev.secondaryMuscles || []).filter((m) => m !== muscle),
    }));
  };

  // Available muscles for secondary (exclude primary)
  const availableForSecondary = ALL_MUSCLE_GROUPS.filter(
    (m) => m !== formData.primaryMuscle
  );

  const content = (
    <>
      {!noContainer && (
        <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
            <Target className="text-white" size={18} />
          </div>
          קבוצות שרירים (Muscle Groups)
        </h2>
      )}

      <div className="space-y-6">
        {/* Primary Muscle - Dropdown */}
        <div>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
            <span className="inline-flex items-center justify-center w-5 h-5 bg-orange-500 text-white text-xs font-bold rounded-full">1</span>
            שריר ראשי (Primary Muscle)
          </label>
          <p className="text-xs text-gray-500 mb-3">
            השריר העיקרי שהתרגיל מאמן
          </p>
          <select
            value={formData.primaryMuscle || ''}
            onChange={(e) => handlePrimaryMuscleChange(e.target.value as MuscleGroup | '')}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm font-medium"
          >
            <option value="">בחר שריר ראשי...</option>
            {ALL_MUSCLE_GROUPS.map((muscle) => (
              <option key={muscle} value={muscle}>
                {MUSCLE_GROUP_LABELS[muscle].he} ({MUSCLE_GROUP_LABELS[muscle].en})
              </option>
            ))}
          </select>
          
          {/* Show selected primary as badge */}
          {formData.primaryMuscle && (
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-orange-100 text-orange-700 rounded-lg text-sm font-bold border border-orange-300">
                <Target size={14} />
                {MUSCLE_GROUP_LABELS[formData.primaryMuscle].he}
              </span>
            </div>
          )}
        </div>

        {/* Secondary Muscles - Multi-select */}
        <div>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
            <span className="inline-flex items-center justify-center w-5 h-5 bg-gray-500 text-white text-xs font-bold rounded-full">2</span>
            שרירים משניים (Secondary Muscles)
          </label>
          <p className="text-xs text-gray-500 mb-3">
            שרירים נוספים שמופעלים בתרגיל (אפשר לבחור מספר)
          </p>
          
          {/* Selected secondary muscles as tags */}
          {formData.secondaryMuscles && formData.secondaryMuscles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {formData.secondaryMuscles.map((muscle) => (
                <span
                  key={muscle}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium"
                >
                  {MUSCLE_GROUP_LABELS[muscle].he}
                  <button
                    type="button"
                    onClick={() => removeSecondaryMuscle(muscle)}
                    className="hover:bg-gray-200 rounded-full p-0.5 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* All muscles grid for selection */}
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {availableForSecondary.map((muscle) => {
              const isSelected = formData.secondaryMuscles?.includes(muscle);
              return (
                <button
                  key={muscle}
                  type="button"
                  onClick={() => toggleSecondaryMuscle(muscle)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                    isSelected
                      ? 'bg-cyan-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {isSelected && <Check size={12} />}
                  {MUSCLE_GROUP_LABELS[muscle].he}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );

  if (noContainer) {
    return content;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      {content}
    </div>
  );
}
