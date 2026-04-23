'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle } from 'lucide-react';
import { resolvePersonaImage } from '@/features/parks/core/hooks/useGroupPresence';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ProfileUser {
  uid: string;
  name: string;
  photoURL?: string;
  personaId?: string;
  lemurStage?: number;
  runningLevel?: number;
  activity?: { status: string; workoutTitle?: string };
}

interface UserProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  user: ProfileUser | null;
}

const ACTIVITY_LABELS: Record<string, string> = {
  running: 'רץ/ה עכשיו',
  walking: 'הולך/ת עכשיו',
  cycling: 'רוכב/ת עכשיו',
  strength: 'מתאמן/ת עכשיו',
};

const STAGE_TITLES: Record<number, string> = {
  1: 'מתחיל', 2: 'שוחר', 3: 'מתאמן', 4: 'פעיל', 5: 'יציב',
  6: 'מתקדם', 7: 'חזק', 8: 'אלוף', 9: 'מאסטר', 10: 'אגדה',
};

export default function UserProfileSheet({ isOpen, onClose, user }: UserProfileSheetProps) {
  const [enriched, setEnriched] = useState<ProfileUser | null>(null);

  useEffect(() => {
    if (!isOpen || !user) { setEnriched(null); return; }
    setEnriched(user);

    if (!user.personaId && !user.lemurStage) {
      getDoc(doc(db, 'presence', user.uid))
        .then((snap) => {
          if (!snap.exists()) return;
          const d = snap.data();
          setEnriched((prev) =>
            prev
              ? {
                  ...prev,
                  personaId: d.personaId ?? prev.personaId,
                  lemurStage: d.lemurStage ?? prev.lemurStage,
                  runningLevel: d.level ?? prev.runningLevel,
                  activity: d.activity ?? prev.activity,
                }
              : prev,
          );
        })
        .catch(() => {});
    }
  }, [isOpen, user]);

  if (!user) return null;

  const display = enriched ?? user;
  const avatarSrc = display.photoURL || resolvePersonaImage(display.personaId);
  const stageLabel = display.lemurStage ? STAGE_TITLES[display.lemurStage] ?? `שלב ${display.lemurStage}` : null;
  const activityLabel = display.activity?.status ? ACTIVITY_LABELS[display.activity.status] : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — subtle blur, map still visible */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/25 backdrop-blur-sm z-[110]"
          />

          {/* Waze-style popover card — offset upward so marker stays visible */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: 'spring', damping: 22, stiffness: 400, mass: 0.6 }}
            className="fixed inset-0 z-[110] flex items-center justify-center pointer-events-none px-6"
            style={{
              paddingTop: 'max(1.5rem, env(safe-area-inset-top, 24px))',
              paddingBottom: 'calc(max(1.5rem, env(safe-area-inset-bottom, 24px)) + 60px)',
            }}
          >
            <div
              className="relative bg-white rounded-3xl shadow-2xl overflow-hidden pointer-events-auto w-[280px] max-h-full"
              dir="rtl"
              style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)' }}
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-3 left-3 z-10 w-7 h-7 rounded-full bg-gray-100/80 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
              >
                <X size={14} className="text-gray-500" />
              </button>

              {/* Top gradient accent */}
              <div className="h-16 bg-gradient-to-bl from-cyan-400 via-cyan-500 to-teal-400 relative">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.2),transparent)]" />
              </div>

              {/* Avatar — overlapping the gradient */}
              <div className="flex flex-col items-center -mt-10 px-5 pb-5">
                <div className="relative mb-2">
                  <div className="w-[72px] h-[72px] rounded-full overflow-hidden border-[3px] border-white shadow-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatarSrc}
                      alt={display.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = resolvePersonaImage(null); }}
                    />
                  </div>
                  {/* Lemur stage badge */}
                  {display.lemurStage != null && display.lemurStage > 0 && (
                    <div className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center border-2 border-cyan-400">
                      <span className="text-[11px] font-black text-cyan-700">L{display.lemurStage}</span>
                    </div>
                  )}
                </div>

                {/* Name */}
                <h2 className="text-base font-black text-gray-900 leading-tight">{display.name}</h2>

                {/* Stage label */}
                {stageLabel && (
                  <span className="mt-1 px-3 py-0.5 bg-cyan-50 text-cyan-700 text-[10px] font-bold rounded-full">
                    {stageLabel}
                  </span>
                )}

                {/* Activity status pill */}
                {activityLabel && (
                  <div className="flex items-center gap-1.5 mt-2.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-bold text-emerald-700">{activityLabel}</span>
                  </div>
                )}

                {/* Send message button */}
                <button
                  onClick={() => { /* TODO: Open DM / chat */ }}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-gray-500 text-sm font-bold active:scale-[0.97] transition-all border border-gray-100"
                >
                  <MessageCircle size={15} />
                  שלח הודעה
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
