'use client';

export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ParkForm from '@/features/admin/components/parks/ParkForm';
import { Loader2 } from 'lucide-react';

function AddParkPageContent() {
  const searchParams = useSearchParams();
  const authorityId = searchParams.get('authorityId');

  return (
    <ParkForm
      defaultAuthorityId={authorityId || undefined}
    />
  );
}

export default function AddParkPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-cyan-600 animate-spin" />
        </div>
      }
    >
      <AddParkPageContent />
    </Suspense>
  );
}
