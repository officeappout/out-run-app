'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getExercise, updateExercise } from '@/features/content/exercises';
import { Exercise, ExerciseFormData, getLocalizedText } from '@/features/content/exercises';
import { getAllPrograms } from '@/features/content/programs';
import { Program } from '@/features/content/programs';
import { Save, X, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import ExerciseEditorForm from '@/features/content/exercises/admin/ExerciseEditorForm';

export default function EditExercisePage() {
  const router = useRouter();
  const params = useParams();
  const exerciseId = params.id as string;
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [exerciseId]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  if (!exercise) {
    return null;
  }

  const initialData: ExerciseFormData = {
    name: exercise.name,
    type: exercise.type,
    loggingMode: exercise.loggingMode || 'reps',
    equipment: exercise.equipment,
    muscleGroups: exercise.muscleGroups,
    programIds: exercise.programIds,
    media: exercise.media,
    content: exercise.content,
    alternativeEquipmentRequirements: exercise.alternativeEquipmentRequirements,
    execution_methods: exercise.execution_methods,
    targetPrograms: exercise.targetPrograms,
    movementGroup: exercise.movementGroup,
    base_movement_id: exercise.base_movement_id,
    // Legacy fields for backward compatibility
    requiredGymEquipment: exercise.requiredGymEquipment,
    requiredUserGear: exercise.requiredUserGear,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/exercises"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowRight size={18} />
            חזור לרשימת התרגילים
          </Link>
          <h1 className="text-3xl font-black text-gray-900">עריכת תרגיל</h1>
          <p className="text-gray-500 mt-2">
            {getLocalizedText(exercise.name, 'he')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/exercises"
            className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors"
          >
            <X size={18} />
            ביטול
          </Link>
          <button
            onClick={() => {
              const form = document.getElementById('exercise-form') as HTMLFormElement;
              form?.requestSubmit();
            }}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors disabled:opacity-50 shadow-lg"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {isSubmitting ? 'שומר...' : 'שמור שינויים'}
          </button>
        </div>
      </div>

      <ExerciseEditorForm
        programs={programs}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        initialData={initialData}
      />
    </div>
  );
}
