'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createExercise, getExercise } from '@/features/content/exercises';
import { ExerciseFormData, ExerciseType, MuscleGroup, EquipmentType } from '@/features/content/exercises';
import { getAllPrograms } from '@/features/content/programs';
import { Program } from '@/features/content/programs';
import { Save, X, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import ExerciseEditorForm from '@/features/content/exercises/admin/ExerciseEditorForm';

export default function NewExercisePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);

  useEffect(() => {
    loadPrograms();
  }, []);

  const loadPrograms = async () => {
    try {
      const data = await getAllPrograms();
      setPrograms(data);
    } catch (error) {
      console.error('Error loading programs:', error);
    }
  };

  const handleSubmit = async (formData: ExerciseFormData) => {
    try {
      setIsSubmitting(true);
      await createExercise(formData);
      router.push('/admin/exercises');
    } catch (error) {
      console.error('Error creating exercise:', error);
      alert('שגיאה ביצירת התרגיל');
    } finally {
      setIsSubmitting(false);
    }
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
          <h1 className="text-3xl font-black text-gray-900">תרגיל חדש</h1>
          <p className="text-gray-500 mt-2">צור תרגיל אימון חדש</p>
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
            {isSubmitting ? 'שומר...' : 'שמור תרגיל'}
          </button>
        </div>
      </div>

      <ExerciseEditorForm
        programs={programs}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        initialData={undefined}
      />
    </div>
  );
}
