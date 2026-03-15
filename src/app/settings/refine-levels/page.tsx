'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

import VisualSlider from '@/features/user/onboarding/components/visual-assessment/VisualSlider';
import { clearContentCache } from '@/features/user/onboarding/services/visual-content-resolver.service';
import type { UserDemographics, AssessmentLevels } from '@/features/user/onboarding/types/visual-assessment.types';

const CATEGORIES = ['push', 'pull', 'legs', 'core'] as const;

export default function RefineLevelsPage() {
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [levels, setLevels] = useState<AssessmentLevels>({ push: 5, pull: 5, legs: 5, core: 5 });
  const [demographics, setDemographics] = useState<UserDemographics>({ age: 25, gender: 'male' });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/');
        return;
      }
      setUid(user.uid);

      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.data();
        if (data?.assessmentResults?.levels) {
          setLevels(data.assessmentResults.levels);
        }
        if (data?.core?.birthDate) {
          const birth = data.core.birthDate.toDate ? data.core.birthDate.toDate() : new Date(data.core.birthDate);
          const age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          setDemographics({ age, gender: data.core.gender || 'male' });
        }
      } catch (err) {
        console.error('[RefineLevels] Failed to load user data:', err);
      }
      setLoading(false);
    });
    return () => { unsub(); clearContentCache(); };
  }, [router]);

  const handleSliderConfirm = useCallback((confirmedLevel: number) => {
    const cat = CATEGORIES[categoryIndex];
    const newLevels = { ...levels, [cat]: confirmedLevel };
    setLevels(newLevels);

    if (categoryIndex < CATEGORIES.length - 1) {
      setCategoryIndex((i) => i + 1);
    } else {
      saveLevels(newLevels);
    }
  }, [categoryIndex, levels]);

  const saveLevels = async (finalLevels: AssessmentLevels) => {
    if (!uid) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', uid), {
        assessmentResults: {
          levels: finalLevels,
          average: Math.round((finalLevels.push + finalLevels.pull + finalLevels.legs + finalLevels.core) / 4),
          refinedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setSaved(true);
      setTimeout(() => router.back(), 1500);
    } catch (err) {
      console.error('[RefineLevels] Save failed:', err);
      alert('שגיאה בשמירה — נסו שנית');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-white flex items-center justify-center" dir="rtl">
        <Loader2 size={32} className="text-[#5BC2F2] animate-spin" />
      </div>
    );
  }

  if (saving || saved) {
    return (
      <div className="min-h-[100dvh] bg-white flex items-center justify-center" dir="rtl">
        <div className="text-center">
          {saved ? (
            <>
              <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
              <h2 className="text-xl font-black text-slate-900">הרמות עודכנו בהצלחה</h2>
              <p className="text-sm text-slate-500 mt-1">חוזרים להגדרות...</p>
            </>
          ) : (
            <>
              <Loader2 size={36} className="text-[#5BC2F2] animate-spin mx-auto mb-3" />
              <h2 className="text-xl font-black text-slate-900">שומר שינויים...</h2>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50 flex flex-col"
      dir="rtl"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
          <ArrowRight size={22} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-lg font-black text-slate-900">עדכון רמות</h1>
          <p className="text-xs text-slate-500">כוונו את הרמה לכל קבוצת שרירים</p>
        </div>
      </div>

      {/* Slider area */}
      <div className="flex-1 flex flex-col w-full max-w-md mx-auto overflow-hidden min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={`refine-${CATEGORIES[categoryIndex]}`}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col"
          >
            <VisualSlider
              category={CATEGORIES[categoryIndex]}
              initialLevel={levels[CATEGORIES[categoryIndex]]}
              demographics={demographics}
              onLevelConfirm={handleSliderConfirm}
              stepIndex={categoryIndex}
              totalSteps={CATEGORIES.length}
              minLevel={1}
              maxLevel={20}
              mode="deep"
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
