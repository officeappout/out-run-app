'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle2, Target, Footprints } from 'lucide-react';

/**
 * Roadmap Page - Final destination after onboarding completion
 * This is a placeholder that will be replaced with the actual roadmap implementation
 */
export default function RoadmapPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6" dir="rtl">
      <div className="max-w-md mx-auto mt-20">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-black text-[#5BC2F2] tracking-tight italic mb-4">OUT</h1>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">ברוכים הבאים!</h2>
          <p className="text-slate-600">האימונים שלך מתחילים עכשיו</p>
        </motion.div>

        {/* Placeholder Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-white rounded-3xl p-8 shadow-xl border border-slate-200 space-y-6"
        >
          <div className="text-center space-y-4">
            <CheckCircle2 size={48} className="text-green-500 mx-auto" />
            <h3 className="text-xl font-bold text-slate-900">
              השלמת את תהליך ההרשמה בהצלחה!
            </h3>
            <p className="text-slate-600">
              דף ה-Roadmap המלא יופיע כאן בקרוב
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-6">
            <button
              onClick={() => router.push('/home')}
              className="w-full bg-[#5BC2F2] text-white py-4 rounded-2xl font-bold text-lg hover:bg-[#4ab0e0] transition-colors shadow-lg"
            >
              לך לדף הבית
            </button>
            <button
              onClick={() => router.push('/map')}
              className="w-full bg-white border-2 border-[#5BC2F2] text-[#5BC2F2] py-4 rounded-2xl font-bold text-lg hover:bg-blue-50 transition-colors"
            >
              צפה במפה
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
