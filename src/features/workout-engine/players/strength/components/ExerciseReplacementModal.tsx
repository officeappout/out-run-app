'use client';

import React, { useState, useEffect } from 'react';
import { Exercise, ExecutionMethod, RequiredGearType, getLocalizedText } from '@/features/content/exercises';
import { getExerciseVariations, getAlternativeExercises, AlternativeExerciseOption } from '../../../generator/services/exercise-replacement.service';
import { getGearBadgeProps, getMuscleGroupLabel } from '../../../shared/utils/gear-mapping.utils';
import { selectExecutionMethodWithBrand } from '../../../generator/services/execution-method-selector.service';
import { ExecutionLocation } from '@/features/content/exercises';
import { UserFullProfile } from '@/types/user-profile';
import { Park } from '@/types/admin-types';
import { TrendingDown, TrendingUp, Minus, Target, Dumbbell, Radio, Hand } from 'lucide-react';

interface ExerciseReplacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentExercise: Exercise;
  currentLevel: number;
  location: ExecutionLocation;
  park: Park | null;
  userProfile: UserFullProfile;
  onReplace: (newExercise: Exercise, executionMethod: ExecutionMethod) => void;
}

type TabType = 'adaptation' | 'alternative';

export default function ExerciseReplacementModal({
  isOpen,
  onClose,
  currentExercise,
  currentLevel,
  location,
  park,
  userProfile,
  onReplace,
}: ExerciseReplacementModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('adaptation');
  const [adaptationExercises, setAdaptationExercises] = useState<AlternativeExerciseOption[]>([]);
  const [alternativeExercises, setAlternativeExercises] = useState<AlternativeExerciseOption[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<AlternativeExerciseOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [gearLabels, setGearLabels] = useState<Record<string, { label: string }>>({});

  // Get active program ID
  const activeProgramId = userProfile?.progression.activePrograms?.[0]?.templateId || 
                          userProfile?.progression.activePrograms?.[0]?.id;

  // Helper to get exercise level from targetPrograms
  const getExerciseLevel = (exercise: Exercise): number => {
    if (exercise.targetPrograms && activeProgramId) {
      const matchingTarget = exercise.targetPrograms.find(
        (tp) => tp.programId === activeProgramId
      );
      if (matchingTarget) {
        return matchingTarget.level;
      }
    }
    return 1; // Default to Level 1
  };

  // Helper to get location label in Hebrew
  const getLocationLabel = (loc: ExecutionLocation): string => {
    const labels: Record<ExecutionLocation, string> = {
      home: 'בית',
      park: 'פארק',
      street: 'רחוב',
      office: 'משרד',
      school: 'בית ספר',
      gym: 'חדר כושר',
    };
    return labels[loc] || loc;
  };

  // Load exercises when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadExercises = async () => {
      setLoading(true);
      try {
        // Load both tabs in parallel
        const [variations, alternatives] = await Promise.all([
          getExerciseVariations(currentExercise, currentLevel, location, park, userProfile, activeProgramId),
          getAlternativeExercises(currentExercise, currentLevel, location, park, userProfile, activeProgramId),
        ]);

        setAdaptationExercises(variations);
        setAlternativeExercises(alternatives);

        // Load gear labels for all exercises
        const gearLabelPromises: Promise<[string, { label: string }]>[] = [];

        // For adaptation exercises, use execution methods from current context
        for (const option of variations) {
          if (option.exercise.execution_methods) {
            const method = option.exercise.execution_methods.find((m) => m.location === location);
            if (method) {
              gearLabelPromises.push(
                getGearBadgeProps(method.requiredGearType, method.gearId).then((props) => [
                  option.exercise.id,
                  props,
                ])
              );
            }
          }
        }

        // For alternative exercises, use selected execution method
        for (const option of alternatives) {
          if (option.selectedExecutionMethod) {
            gearLabelPromises.push(
              getGearBadgeProps(
                option.selectedExecutionMethod.requiredGearType,
                option.selectedExecutionMethod.gearId
              ).then((props) => [option.exercise.id, props])
            );
          }
        }

        const labels = await Promise.all(gearLabelPromises);
        setGearLabels(Object.fromEntries(labels));
      } catch (error) {
        console.error('Error loading alternative exercises:', error);
      } finally {
        setLoading(false);
      }
    };

    loadExercises();
  }, [isOpen, currentExercise, currentLevel, location, park, userProfile, activeProgramId]);

  // Reset selection when tab changes
  useEffect(() => {
    setSelectedExercise(null);
  }, [activeTab]);

  const handleReplace = async () => {
    if (!selectedExercise) return;

    // Get execution method with brand matching
    let executionMethod: ExecutionMethod | undefined;

    if (activeTab === 'adaptation') {
      // For adaptation, use enhanced selector with brand matching
      executionMethod = await selectExecutionMethodWithBrand(
        selectedExercise.exercise,
        location,
        park,
        userProfile
      );
    } else {
      // For alternative, use the pre-selected execution method
      executionMethod = selectedExercise.selectedExecutionMethod;
    }

    if (executionMethod) {
      onReplace(selectedExercise.exercise, executionMethod);
      onClose();
    }
  };

  const getLevelIcon = (comparison: 'lower' | 'same' | 'higher') => {
    switch (comparison) {
      case 'lower':
        return TrendingDown;
      case 'higher':
        return TrendingUp;
      default:
        return Minus;
    }
  };

  const getLevelColor = (comparison: 'lower' | 'same' | 'higher') => {
    switch (comparison) {
      case 'lower':
        return 'text-orange-500';
      case 'higher':
        return 'text-emerald-500';
      default:
        return 'text-blue-500';
    }
  };

  const getPrimaryMuscle = () => {
    if (currentExercise.muscleGroups.length === 0) return '';
    return getMuscleGroupLabel(currentExercise.muscleGroups[0]);
  };

  const getExerciseImage = (exercise: Exercise) => {
    // Try execution method image first
    if (exercise.execution_methods && exercise.execution_methods.length > 0) {
      const method = exercise.execution_methods.find((m) => m.location === location);
      if (method?.media?.imageUrl) {
        return method.media.imageUrl;
      }
    }
    // Fallback to legacy media
    return exercise.media?.imageUrl || 'https://via.placeholder.com/80';
  };

  if (!isOpen) return null;

  const currentExercises = activeTab === 'adaptation' ? adaptationExercises : alternativeExercises;

  return (
    <div className="fixed inset-0 z-50" dir="rtl">
      {/* Blur Background */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-10" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 top-16 z-20 bg-white dark:bg-gray-900 rounded-t-[32px] shadow-2xl flex flex-col">
        {/* Handle */}
        <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-6" />

        <div className="px-6 flex-1 overflow-y-auto pb-40">
          {/* Header */}
          <div className="flex items-start gap-4 mb-8">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm flex-shrink-0">
              <img
                alt={getLocalizedText(currentExercise.name, 'he')}
                className="w-full h-full object-cover"
                src={getExerciseImage(currentExercise)}
              />
            </div>
            <div className="flex-1 pt-1">
              <h1 className="text-sm font-semibold text-gray-500 dark:text-gray-400">החלפת תרגיל</h1>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1 leading-tight">
                {getLocalizedText(currentExercise.name, 'he')}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-7 h-7 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full">
                  <Target size={14} className="text-gray-400" />
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {getPrimaryMuscle()}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex mt-6 border-b border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setActiveTab('adaptation')}
              className={`flex-1 py-4 text-center font-bold border-b-2 transition-colors ${
                activeTab === 'adaptation'
                  ? 'text-primary border-primary'
                  : 'text-gray-400 dark:text-gray-500 border-transparent'
              }`}
            >
              התאמת התרגיל
            </button>
            <button
              onClick={() => setActiveTab('alternative')}
              className={`flex-1 py-4 text-center font-bold border-b-2 transition-colors ${
                activeTab === 'alternative'
                  ? 'text-primary border-primary'
                  : 'text-gray-400 dark:text-gray-500 border-transparent'
              }`}
            >
              תרגיל חלופי
            </button>
          </div>

          {/* Tab Description */}
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 my-4">
            {activeTab === 'adaptation'
              ? 'גרסאות של אותו תרגיל, ברמות קושי שונות'
              : 'תרגילים שונים לאותה קבוצת השרירים'}
          </p>

          {/* Exercise List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-400">טוען...</div>
            </div>
          ) : currentExercises.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-slate-400 mb-2">לא נמצאו תרגילים חלופיים</div>
              <div className="text-xs text-slate-500">
                אין חלופות זמינות למיקום הנוכחי ({getLocationLabel(location)})
              </div>
            </div>
          ) : (
            <div className="space-y-4 pb-32">
              {currentExercises.map((option) => {
                const isSelected = selectedExercise?.exercise.id === option.exercise.id;
                const gearInfo = gearLabels[option.exercise.id] || { label: 'ללא ציוד' };

                // Get execution method to determine gear type
                let executionMethodForGear: ExecutionMethod | undefined;
                if (activeTab === 'adaptation') {
                  executionMethodForGear = option.exercise.execution_methods?.find(
                    (m) => m.location === location
                  );
                } else {
                  executionMethodForGear = option.selectedExecutionMethod;
                }

                const gearType = executionMethodForGear?.requiredGearType;
                const isImprovised = gearType === 'improvised';
                const isFixedEquipment = gearType === 'fixed_equipment';

                return (
                  <div
                    key={option.exercise.id}
                    onClick={() => setSelectedExercise(option)}
                    className={`bg-card-light dark:bg-card-dark p-3 rounded-2xl shadow-sm border flex gap-4 items-center transition-all cursor-pointer ${
                      isSelected
                        ? 'border-2 border-primary ring-2 ring-primary/10 shadow-lg'
                        : 'border-gray-50 dark:border-gray-800 hover:border-primary/50'
                    }`}
                  >
                    <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                      <img
                        alt={getLocalizedText(option.exercise.name, 'he')}
                        className="w-full h-full object-cover"
                        src={getExerciseImage(option.exercise)}
                      />
                    </div>
                    <div className="flex-1 space-y-3">
                      <h3 className="font-bold text-gray-900 dark:text-white">
                        {getLocalizedText(option.exercise.name, 'he')}
                      </h3>
                      <div className="flex items-center justify-between">
                        {/* Gear Badge */}
                        <div className="inline-flex items-center px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-full gap-1">
                          {isImprovised ? (
                            <Hand size={12} />
                          ) : isFixedEquipment ? (
                            <Radio size={12} />
                          ) : (
                            <Dumbbell size={12} />
                          )}
                          <span>{gearInfo.label}</span>
                        </div>

                        {/* Level Badge */}
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            רמה {getExerciseLevel(option.exercise)}
                          </span>
                          {React.createElement(getLevelIcon(option.levelComparison), {
                            size: 16,
                            className: getLevelColor(option.levelComparison),
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="absolute bottom-[80px] left-0 right-0 px-6 pb-6 bg-gradient-to-t from-white dark:from-gray-900 via-white/80 dark:via-gray-900/80 backdrop-blur-md to-transparent">
          <button
            onClick={handleReplace}
            disabled={!selectedExercise}
            className={`w-full font-black py-4 rounded-full text-lg shadow-lg transition-all ${
              selectedExercise
                ? 'bg-primary hover:opacity-90 active:scale-95 text-gray-900 shadow-primary/20'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            החליפו תרגיל
          </button>
        </div>
      </div>
    </div>
  );
}
