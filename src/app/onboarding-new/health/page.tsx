'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import HealthDeclarationStep from '@/features/user/onboarding/components/HealthDeclarationStep';

export default function HealthDeclarationPage() {
  const router = useRouter();
  const { profile } = useUserStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleContinue = async (_value: boolean) => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        console.error('[Health] No user authenticated');
        return;
      }

      // Mark onboarding as fully complete and redirect to dashboard
      await setDoc(doc(db, 'users', uid), {
        onboardingStatus: 'COMPLETED',
        onboardingStep: 'COMPLETED',
        onboardingComplete: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Navigate directly to the dashboard
      router.replace('/home');
    } catch (error) {
      console.error('[Health] Error updating status:', error);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="text-slate-500">טוען...</div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 flex items-center justify-center">
          <div className="text-slate-500">טוען...</div>
        </div>
      }
    >
      <HealthDeclarationStep
        title="הצהרת בריאות"
        description="כדי להתאים לך אימון בטוח, נשמח לדעת על מצבך הרפואי"
        onContinue={handleContinue}
      />
    </Suspense>
  );
}
