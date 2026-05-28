'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins } from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';
import EquipmentFilterSheet from '@/features/content/exercises/client/components/EquipmentFilterSheet';

interface EquipmentStepProps {
  onNext: () => void;
  isJIT?: boolean;
  isLastStep?: boolean;
}

/**
 * EquipmentStep — renders the EquipmentFilterSheet as a full bottom drawer.
 *
 * The sheet opens immediately when this step is active, its dark backdrop
 * covers the story-bar and any content behind it, presenting a clean
 * "ציוד ומיקום" picker with all sections (presets, park, improvised, personal).
 *
 * Tapping "בואו נעדכן ציוד" (or the X / backdrop) writes selections to the
 * onboarding store and advances to the next step.
 */
export default function EquipmentStep({ onNext }: EquipmentStepProps) {
  const { updateData, data, addCoins } = useOnboardingStore();
  const [showCoinAnimation, setShowCoinAnimation] = useState(false);
  const [hasEarnedReward, setHasEarnedReward] = useState(false);

  const selectedEquipmentIds = data.equipmentList ?? [];

  const triggerCoinReward = () => {
    if (hasEarnedReward) return;
    setShowCoinAnimation(true);
    addCoins(10);
    setHasEarnedReward(true);
    setTimeout(() => setShowCoinAnimation(false), 1000);
  };

  // Live store updates as the user toggles chips (before tapping confirm).
  const handleEquipmentChange = (ids: string[]) => {
    const wasEmpty = (data.equipmentList ?? []).length === 0;
    updateData({ equipmentList: ids, hasEquipment: ids.length > 0 });
    if (wasEmpty && ids.length > 0) triggerCoinReward();
  };

  // Called when the user taps "בואו נעדכן ציוד" — ids already stripped of sentinel.
  const handleApply = (ids: string[]) => {
    updateData({ equipmentList: ids, hasEquipment: ids.length > 0 });
    triggerCoinReward();
    onNext();
  };

  // Tapping the X button or backdrop = skip equipment step.
  const handleClose = () => {
    onNext();
  };

  return (
    <>
      {/* Coin reward — floats above the sheet at z-[100] */}
      {IS_COIN_SYSTEM_ENABLED && (
        <AnimatePresence>
          {showCoinAnimation && (
            <motion.div
              initial={{ opacity: 1, y: 0, scale: 1 }}
              animate={{ opacity: 0, y: -30, scale: 1.2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="fixed top-20 left-1/2 -translate-x-1/2 pointer-events-none z-[100]"
            >
              <div className="flex items-center gap-1 bg-amber-200 text-amber-800 rounded-full px-3 py-2 shadow-lg border border-amber-300">
                <Coins size={18} className="text-amber-800" strokeWidth={2.5} />
                <span className="text-sm font-bold font-simpler">+10</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/*
       * The sheet renders as a fixed bottom drawer with a dark backdrop.
       * isOpen={true} means it springs open immediately when this step mounts.
       * mode="inline-onboarding" enables the full layout (presets + all sections)
       * with the pill-shaped "בואו נעדכן ציוד" confirm button, no Firestore write.
       */}
      <EquipmentFilterSheet
        isOpen={true}
        onClose={handleClose}
        mode="inline-onboarding"
        initialIds={selectedEquipmentIds}
        onChange={handleEquipmentChange}
        onApply={handleApply}
      />
    </>
  );
}
