'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { UserFullProfile } from '@/types/user-profile';
import { resolveOnboardingEntryHref } from '@/features/user/onboarding/utils/onboarding-entry';

interface AddStrengthProgramCardProps {
  profile: UserFullProfile | null | undefined;
}

/**
 * First of a future-stacking family of "add a program" cards. Rendered as the
 * first slide in the home pre-workout carousel (before the steps/route card)
 * whenever the user has no strength profile — see the carousel call site in
 * home/page.tsx for the gating and the sentinel-item wiring that keeps this
 * card's presence from touching PreWorkoutCardRenderer or any other slide.
 *
 * Copies the gateway's "תוכנית כוח" card visual pattern (gateway/page.tsx's
 * Card C) verbatim. Sized to fit the carousel's fixed slot the same way
 * SuggestionCard.tsx already does for this exact carousel: a transparent
 * h-full/w-full centering wrapper, with the visible card sized to its own
 * content rather than stretched to fill the slot's full height.
 *
 * Routes through resolveOnboardingEntryHref, the same helper
 * ConsistencyWidget/ProgramProgressRow/StrengthVolumeWidget already use for
 * this exact purpose — identity-known vs identity-unknown users both land in
 * the right place without any new branching here.
 */
export default function AddStrengthProgramCard({ profile }: AddStrengthProgramCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleTap = () => {
    if (loading) return;
    setLoading(true);
    router.push(resolveOnboardingEntryHref(profile, 'STRENGTH'));
  };

  return (
    <div className="h-full w-full flex items-center justify-center">
      <motion.button
        whileTap={{ scale: loading ? 1 : 0.97 }}
        onClick={handleTap}
        disabled={loading}
        className="w-full relative overflow-hidden rounded-[24px] shadow-lg h-32 text-right disabled:opacity-60 group"
      >
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url('/images/gateway/card-strength.png')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent" />
        {loading && (
          <div className="absolute inset-0 z-10 bg-white/60 flex items-center justify-center">
            <Loader2 size={28} className="text-[#5BC2F2] animate-spin" />
          </div>
        )}
        <div className="absolute bottom-0 right-0 left-0 p-4 flex flex-col items-start">
          <div className="flex items-center gap-2 mb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/programs/muscle.svg"
              alt=""
              aria-hidden="true"
              className="w-[18px] h-[18px] object-contain"
            />
            <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-simpler)' }}>
              תוכנית כוח
            </h2>
          </div>
          <p className="text-sm text-slate-900 font-medium" style={{ fontFamily: 'var(--font-simpler)' }} dir="rtl">
            אימון מותאם אישית למטרות שלך
          </p>
        </div>
      </motion.button>
    </div>
  );
}
