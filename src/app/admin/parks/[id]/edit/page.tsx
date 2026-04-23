'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPark } from '@/features/parks';
import ParkForm from '@/features/admin/components/parks/ParkForm';
import type { Park } from '@/types/admin-types';
import { Loader2, ArrowRight } from 'lucide-react';

export default function EditParkPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [park, setPark] = useState<Park | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadPark = async () => {
      try {
        setIsLoading(true);
        const data = await getPark(id);
        if (!data) {
          setLoadError('הפארק לא נמצא');
          return;
        }
        setPark(data);
      } catch {
        setLoadError('שגיאה בטעינת הפארק');
      } finally {
        setIsLoading(false);
      }
    };
    loadPark();
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 text-cyan-600 animate-spin mx-auto" />
          <p className="text-gray-500 font-bold">טוען נתוני פארק...</p>
        </div>
      </div>
    );
  }

  if (loadError || !park) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-red-500 text-2xl">!</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800">{loadError || 'הפארק לא נמצא'}</h2>
          <button
            onClick={() => router.push('/admin/locations')}
            className="inline-flex items-center gap-2 text-cyan-600 font-bold hover:underline"
          >
            <ArrowRight size={16} />
            חזור לניהול מיקומים
          </button>
        </div>
      </div>
    );
  }

  return <ParkForm initialData={park} />;
}
