'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  getGearDefinition,
  updateGearDefinition,
} from '@/features/content/equipment/gear';
import { GearDefinitionFormData } from '@/features/content/equipment/gear';
import { Save, X, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import GearDefinitionEditorForm from '@/features/content/equipment/gear/admin/GearDefinitionEditorForm';

export default function EditGearDefinitionPage() {
  const router = useRouter();
  const params = useParams();
  const gearId = params.id as string;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialData, setInitialData] = useState<GearDefinitionFormData | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGearDefinition();
  }, [gearId]);

  const loadGearDefinition = async () => {
    try {
      setLoading(true);
      const gear = await getGearDefinition(gearId);
      if (!gear) {
        alert('הציוד לא נמצא');
        router.push('/admin/gear-definitions');
        return;
      }
      setInitialData({
        name: gear.name,
        description: gear.description,
        icon: gear.icon,
        category: gear.category,
        shopLink: gear.shopLink,
        tutorialVideo: gear.tutorialVideo,
        customIconUrl: gear.customIconUrl,
      });
    } catch (error) {
      console.error('Error loading gear definition:', error);
      alert('שגיאה בטעינת הציוד');
      router.push('/admin/gear-definitions');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: GearDefinitionFormData) => {
    try {
      setIsSubmitting(true);
      await updateGearDefinition(gearId, formData);
      router.push('/admin/gear-definitions');
    } catch (error) {
      console.error('Error updating gear definition:', error);
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

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/gear-definitions"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowRight size={18} />
            חזור לרשימת הציוד
          </Link>
          <h1 className="text-3xl font-black text-gray-900">ערוך ציוד</h1>
          <p className="text-gray-500 mt-2">ערוך הגדרת ציוד אישי</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/gear-definitions"
            className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors"
          >
            <X size={18} />
            ביטול
          </Link>
          <button
            onClick={() => {
              const form = document.getElementById('gear-definition-form') as HTMLFormElement;
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

      {initialData && (
        <GearDefinitionEditorForm
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          initialData={initialData}
        />
      )}
    </div>
  );
}
