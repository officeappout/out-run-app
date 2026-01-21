'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getGymEquipment, updateGymEquipment } from '@/features/content/equipment/gym';
import { GymEquipment, GymEquipmentFormData } from '@/features/content/equipment/gym';
import { Save, X, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import GymEquipmentEditorForm from '@/features/content/equipment/gym/admin/GymEquipmentEditorForm';

export default function EditGymEquipmentPage() {
  const router = useRouter();
  const params = useParams();
  const equipmentId = params.id as string;
  const [equipment, setEquipment] = useState<GymEquipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [equipmentId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const equipmentData = await getGymEquipment(equipmentId);

      if (!equipmentData) {
        alert('ציוד לא נמצא');
        router.push('/admin/gym-equipment');
        return;
      }

      setEquipment(equipmentData);
    } catch (error) {
      console.error('Error loading gym equipment:', error);
      alert('שגיאה בטעינת הציוד');
      router.push('/admin/gym-equipment');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: GymEquipmentFormData) => {
    try {
      setIsSubmitting(true);
      await updateGymEquipment(equipmentId, formData);
      router.push('/admin/gym-equipment');
    } catch (error) {
      console.error('Error updating gym equipment:', error);
      alert('שגיאה בעדכון הציוד');
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

  if (!equipment) {
    return null;
  }

  const initialData: GymEquipmentFormData = {
    name: equipment.name,
    type: equipment.type,
    recommendedLevel: equipment.recommendedLevel,
    isFunctional: equipment.isFunctional,
    muscleGroups: equipment.muscleGroups,
    brands: equipment.brands,
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
          <h1 className="text-3xl font-black text-gray-900">עריכת מתקן</h1>
          <p className="text-gray-500 mt-2">{equipment.name}</p>
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
            {isSubmitting ? 'שומר...' : 'שמור שינויים'}
          </button>
        </div>
      </div>

      <GymEquipmentEditorForm
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        initialData={initialData}
      />
    </div>
  );
}
