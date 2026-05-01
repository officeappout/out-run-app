'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle, Lock } from 'lucide-react';
import { resolvePersonaImage } from '@/features/parks/core/hooks/useGroupPresence';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { useChatStore } from '@/features/social/store/useChatStore';
import { STAGE_TITLES } from '@/features/user/progression/config/stage-titles';

export interface ProfileUser {
  uid: string;
  name: string;
  photoURL?: string;
  personaId?: string;
  lemurStage?: number;
  runningLevel?: number;
  activity?: { status: string; workoutTitle?: string };
  /** Set lazily from users/{uid}.core.ageGroup — used by the DM gate. */
  ageGroup?: 'minor' | 'adult';
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

export default function UserProfileSheet({ isOpen, onClose, user }: UserProfileSheetProps) {
  const [enriched, setEnriched] = useState<ProfileUser | null>(null);
  const { profile: currentProfile } = useUserStore();

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

    // Compliance Phase 2.2 — Minor DM Block (UI layer):
    //   Server-side Firestore rule (firestore.rules → /chats DM create) is
    //   the source of truth and will reject any minor-involved DM. We also
    //   hide the button on the client to avoid a confusing failed click.
    //   This read may return no data when the target's profile is not
    //   discoverable; in that case we leave ageGroup undefined and fall
    //   back to current-user-only gating (still safe — server rule denies).
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (!snap.exists()) return;
        const ag = (snap.data() as any)?.core?.ageGroup;
        if (ag === 'minor' || ag === 'adult') {
          setEnriched((prev) => (prev ? { ...prev, ageGroup: ag } : prev));
        }
      })
      .catch(() => {});
  }, [isOpen, user]);

  if (!user) return null;

  const display = enriched ?? user;
  const avatarSrc = display.photoURL || resolvePersonaImage(display.personaId);
  const stageLabel = display.lemurStage ? STAGE_TITLES[display.lemurStage] ?? `שלב ${display.lemurStage}` : null;
  const activityLabel = display.activity?.status ? ACTIVITY_LABELS[display.activity.status] : null;

  // Compliance Phase 2.2 — DM is blocked when EITHER party is a minor.
  // Self-DMs are also hidden (no point messaging yourself).
  const currentIsMinor = currentProfile?.core?.ageGroup === 'minor';
  const targetIsMinor = display.ageGroup === 'minor';
  const isSelf = currentProfile?.id === display.uid;
  const canDirectMessage = !currentIsMinor && !targetIsMinor && !isSelf;

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

                {/* Send message button — hidden when DM is blocked
                    (current user is a minor, target is a minor, or self).
                    Replaced by an explanatory locked tile so the user
                    understands why messaging is unavailable. */}
                {canDirectMessage ? (
                  <button
                    onClick={() => {
                      if (!currentProfile?.id) return;
                      onClose();
                      void useChatStore.getState().openDM(
                        currentProfile.id,
                        currentProfile.core?.name ?? 'אווטיר',
                        display.uid,
                        display.name,
                      );
                    }}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-gray-500 text-sm font-bold active:scale-[0.97] transition-all border border-gray-100"
                  >
                    <MessageCircle size={15} />
                    שלח הודעה
                  </button>
                ) : (currentIsMinor || targetIsMinor) ? (
                  <div
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-gray-50 rounded-xl text-gray-400 text-xs font-bold border border-gray-100"
                    aria-disabled="true"
                  >
                    <Lock size={13} />
                    הודעות ישירות זמינות רק לבני 18+
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
