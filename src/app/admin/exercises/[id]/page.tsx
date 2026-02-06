'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { getExercise, updateExercise } from '@/features/content/exercises';
import { Exercise, ExerciseFormData, ExecutionMethod, getLocalizedText } from '@/features/content/exercises';
import { getAllPrograms } from '@/features/content/programs';
import { Program } from '@/features/content/programs';
import { Save, X, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import ExerciseEditorForm from '@/features/content/exercises/admin/ExerciseEditorForm';
import MobileFrame from '@/components/MobileFrame';
import ExerciseDetailView from '@/features/app/exercises/components/ExerciseDetailView';
import { useIsMounted } from '@/hooks/useIsMounted';

export default function EditExercisePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const exerciseId = params.id as string;
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ExerciseFormData | null>(null);
  const mounted = useIsMounted();

  // Get context from query params (from Content Status Matrix)
  const contextLocation = searchParams.get('location');
  const contextPersona = searchParams.get('persona');

  // Helper functions - defined outside useMemo to ensure stability
  const sanitizeExecutionMethods = (methods: any[] | undefined): any[] => {
    if (!Array.isArray(methods)) return [];
    return methods.map((method) => {
      const sanitized = { ...method };
      // Ensure methodName is always a string
      if (typeof sanitized.methodName === 'object' && sanitized.methodName !== null) {
        sanitized.methodName = sanitized.methodName.he || sanitized.methodName.en || '';
        console.warn('[EditExercisePage] Sanitized methodName from object:', sanitized.methodName);
      } else if (typeof sanitized.methodName !== 'string') {
        sanitized.methodName = String(sanitized.methodName || '');
      }
      return sanitized;
    });
  };

  const sanitizeHighlights = (highlights: any): string[] => {
    if (!Array.isArray(highlights)) return [];
    return highlights.map((h) => {
      if (typeof h === 'string') return h;
      if (typeof h === 'object' && h !== null) {
        return h.he || h.en || String(h);
      }
      return String(h || '');
    });
  };

  // Compute initialData from exercise (only when exercise exists) - memoized to prevent unnecessary recalculations
  // CRITICAL: ALL metadata fields must be included to prevent data loss on save
  const initialData: ExerciseFormData | null = useMemo(() => {
    if (!exercise) return null;
    return {
      // === BASIC FIELDS ===
      name: exercise.name,
      type: exercise.type,
      loggingMode: exercise.loggingMode || 'reps',
      equipment: exercise.equipment,
      programIds: exercise.programIds,
      
      // === MUSCLE CLASSIFICATION ===
      muscleGroups: exercise.muscleGroups,
      primaryMuscle: exercise.primaryMuscle,
      secondaryMuscles: exercise.secondaryMuscles || [],
      
      // === MOVEMENT CLASSIFICATION (CRITICAL - was missing!) ===
      movementType: exercise.movementType,
      symmetry: exercise.symmetry,
      mechanicalType: exercise.mechanicalType,
      movementGroup: exercise.movementGroup,
      base_movement_id: exercise.base_movement_id,
      
      // === TIMING (was missing!) ===
      secondsPerRep: exercise.secondsPerRep,
      defaultRestSeconds: exercise.defaultRestSeconds,
      
      // === ROLE & BEHAVIOR (was missing!) ===
      exerciseRole: exercise.exerciseRole,
      isFollowAlong: exercise.isFollowAlong,
      
      // === CONTENT ===
      media: exercise.media,
      content: {
        ...exercise.content,
        highlights: sanitizeHighlights(exercise.content?.highlights),
        specificCues: exercise.content?.specificCues || [],
      },
      
      // === EXECUTION METHODS ===
      execution_methods: sanitizeExecutionMethods(exercise.execution_methods),
      targetPrograms: exercise.targetPrograms,
      
      // === TAGS ===
      tags: exercise.tags || [],
      
      // === EQUIPMENT ===
      requiredGymEquipment: exercise.requiredGymEquipment,
      requiredUserGear: exercise.requiredUserGear,
      alternativeEquipmentRequirements: exercise.alternativeEquipmentRequirements,
      
      // === GENERAL METRICS (Effort/Indicators) ===
      noiseLevel: exercise.noiseLevel,
      sweatLevel: exercise.sweatLevel,
      
      // === SAFETY / SENSITIVITY ZONES ===
      injuryShield: exercise.injuryShield || [],
      
      // === TECHNICAL CLASSIFICATION (was missing!) ===
      fieldReady: exercise.fieldReady,
      
      // === PRODUCTION REQUIREMENTS (was missing!) ===
      requiredLocations: exercise.requiredLocations || [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise]);

  // Load data on mount
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId]);

  // Initialize formData with initialData when exercise is loaded (only once)
  useEffect(() => {
    if (initialData && !formData) {
      setFormData(initialData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [exerciseData, programsData] = await Promise.all([
        getExercise(exerciseId),
        getAllPrograms(),
      ]);

      if (!exerciseData) {
        alert('תרגיל לא נמצא');
        router.push('/admin/exercises');
        return;
      }

      setExercise(exerciseData);
      setPrograms(programsData);
    } catch (error) {
      console.error('Error loading exercise:', error);
      alert('שגיאה בטעינת התרגיל');
      router.push('/admin/exercises');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: ExerciseFormData) => {
    try {
      setIsSubmitting(true);
      await updateExercise(exerciseId, formData);
      router.push('/admin/exercises');
    } catch (error) {
      console.error('Error updating exercise:', error);
      alert('שגיאה בעדכון התרגיל');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Convert formData to Exercise for preview - Updated in real-time
  const getPreviewExercise = (): Exercise | null => {
    if (!formData || !exercise) return exercise;
    
    // Ensure execution_methods structure is correct for preview
    const executionMethods = formData.execution_methods && formData.execution_methods.length > 0
      ? formData.execution_methods.map((method) => ({
          ...method,
          media: {
            ...method.media,
            // Ensure mainVideoUrl is properly extracted
            mainVideoUrl: typeof method.media?.mainVideoUrl === 'string' 
              ? method.media.mainVideoUrl 
              : String(method.media?.mainVideoUrl || ''),
            // Ensure imageUrl is properly extracted
            imageUrl: typeof method.media?.imageUrl === 'string'
              ? method.media.imageUrl
              : String(method.media?.imageUrl || ''),
          },
        }))
      : exercise.execution_methods;
    
    // Create a preview exercise from formData with proper structure
    const previewExercise: Exercise = {
      ...exercise,
      name: formData.name,
      type: formData.type,
      loggingMode: formData.loggingMode,
      equipment: formData.equipment,
      muscleGroups: formData.muscleGroups,
      programIds: formData.programIds,
      media: formData.media,
      content: formData.content,
      execution_methods: executionMethods as any,
      executionMethods: executionMethods as any, // Alias for camelCase access
    };
    
    return previewExercise;
  };

  // Get first execution method for preview - Updated in real-time
  const getPreviewExecutionMethod = (): ExecutionMethod | undefined => {
    if (!formData?.execution_methods || formData.execution_methods.length === 0) {
      return exercise?.execution_methods?.[0];
    }
    const method = formData.execution_methods[0] as ExecutionMethod;
    // Ensure media structure is correct
    return {
      ...method,
      media: {
        ...method.media,
        mainVideoUrl: typeof method.media?.mainVideoUrl === 'string' 
          ? method.media.mainVideoUrl 
          : String(method.media?.mainVideoUrl || ''),
        imageUrl: typeof method.media?.imageUrl === 'string'
          ? method.media.imageUrl
          : String(method.media?.imageUrl || ''),
      },
    };
  };

  // Use useMemo to ensure preview updates when formData changes
  const previewExercise = useMemo(() => getPreviewExercise(), [formData, exercise]);
  const previewMethod = useMemo(() => getPreviewExecutionMethod(), [formData, exercise]);

  // Early returns AFTER all hooks
  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  if (!exercise || !initialData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">תרגיל לא נמצא</div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-50 text-slate-900" dir="rtl">
      {/* Sticky Header with Action Buttons */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="w-full px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/admin/exercises"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2 transition-colors text-sm"
              >
                <ArrowRight size={16} />
                חזור לרשימת התרגילים
              </Link>
              <h1 className="text-2xl font-black text-gray-900">עריכת תרגיל</h1>
              <p className="text-sm text-gray-500 mt-1">
                {getLocalizedText(exercise.name, 'he')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/admin/exercises"
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors text-sm"
              >
                <X size={16} />
                ביטול
              </Link>
              <button
                onClick={() => {
                  const form = document.getElementById('exercise-form') as HTMLFormElement;
                  form?.requestSubmit();
                }}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors disabled:opacity-50 shadow-lg text-sm"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {isSubmitting ? 'שומר...' : 'שמור שינויים'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Two-Column Layout: Wide Form (Right), Sticky Preview (Left) - RTL order */}
      <div className="w-full px-6 py-6">
        <div className="grid grid-cols-12 gap-8 max-w-[1920px] mx-auto">
          {/* Right Column: Wide Editor Form (70% = 8.4/12) - First in RTL */}
          <div className="col-span-12 lg:col-span-8 xl:col-span-9">
            <ExerciseEditorForm
              programs={programs}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              initialData={initialData}
              exerciseId={exerciseId}
              contextLocation={contextLocation || undefined}
              contextPersona={contextPersona || undefined}
              onFormDataChange={setFormData}
            />
          </div>

          {/* Left Column: Sticky Mobile Preview (30% = 3.6/12) - Second in RTL */}
          <div className="col-span-12 lg:col-span-4 xl:col-span-3">
            <div className="sticky top-10 self-start">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 shadow-lg border border-gray-200">
                <div className="flex items-center justify-center">
                  <MobileFrame>
                    {previewExercise ? (
                      <ExerciseDetailView
                        exercise={previewExercise}
                        executionMethod={previewMethod}
                        onBack={() => {}}
                        onStart={() => {}}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-50">
                        <p className="text-gray-400">טוען תצוגה מקדימה...</p>
                      </div>
                    )}
                  </MobileFrame>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
