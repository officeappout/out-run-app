'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createGymEquipment } from '@/features/content/equipment/gym';
import { GymEquipmentFormData } from '@/features/content/equipment/gym';
import { Save, X, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import GymEquipmentEditorForm from '@/features/content/equipment/gym/admin/GymEquipmentEditorForm';

export default function NewGymEquipmentPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (formData: GymEquipmentFormData) => {
    try {
      setIsSubmitting(true);
      await createGymEquipment(formData);
      router.push('/admin/gym-equipment');
    } catch (error) {
      console.error('Error creating gym equipment:', error);
      alert('שגיאה ביצירת הציוד');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/gym-equipment"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowRight size={18} />
            חזור לרשימת הציוד
          </Link>
          <h1 className="text-3xl font-black text-gray-900">מתקן חדש</h1>
          <p className="text-gray-500 mt-2">צור מתקן כושר חדש</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/gym-equipment"
            className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors"
          >
            <X size={18} />
            ביטול
          </Link>
          <button
            onClick={() => {
              const form = document.getElementById('gym-equipment-form') as HTMLFormElement;
              form?.requestSubmit();
            }}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors disabled:opacity-50 shadow-lg"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {isSubmitting ? 'שומר...' : 'שמור מתקן'}
          </button>
        </div>
      </div>

      <GymEquipmentEditorForm
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        initialData={undefined}
      />
    </div>
  );
}
