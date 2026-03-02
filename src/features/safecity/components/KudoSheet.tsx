'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { PresenceMarker } from '../services/segregation.service';
import { sendKudo } from '../services/kudos.service';
import { getActivityVisual, getLemurAsset } from '../utils/activity-icon';

interface KudoSheetProps {
  marker: PresenceMarker | null;
  fromUid: string;
  fromName: string;
  onClose: () => void;
  onSent: () => void; // triggers confetti + haptic in parent
}

/**
 * KudoSheet — bottom drawer that appears when tapping a Lemur on the map.
 * Shows the friend's name, activity status, and a big High Five button.
 */
export default function KudoSheet({ marker, fromUid, fromName, onClose, onSent }: KudoSheetProps) {
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!marker) return null;

  const activityVisual = getActivityVisual(marker.activity?.status);
  const level = marker.level ?? 1;
  const lemurSrc = getLemurAsset(marker.activity?.status);

  const handleSend = async () => {
    if (isSending || sent) return;
    setIsSending(true);

    try {
      await sendKudo(marker.uid, fromUid, fromName, 'high_five');
      setSent(true);
      onSent();

      setTimeout(() => {
        onClose();
        setSent(false);
      }, 1200);
    } catch (err) {
      console.error('[KudoSheet] sendKudo failed:', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AnimatePresence>
      {marker && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/30"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-[91] bg-white rounded-t-3xl shadow-2xl"
            style={{ maxHeight: '45vh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 left-4 p-1 rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="px-6 pb-8 pt-2 flex flex-col items-center gap-4" dir="rtl">
              {/* Avatar + level */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full overflow-hidden border-3 border-[#00BAF7] shadow-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lemurSrc}
                    alt={marker.name}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center justify-center rounded-full shadow-sm"
                  style={{ width: 26, height: 18, background: '#00BAF7', border: '2px solid white' }}
                >
                  <span className="text-[10px] font-black text-white">{level}</span>
                </div>
              </div>

              {/* Name + status */}
              <div className="text-center">
                <h3 className="text-lg font-bold text-gray-900">{marker.name}</h3>
                {activityVisual ? (
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <span className="text-sm">{activityVisual.emoji}</span>
                    <span className="text-[13px] font-semibold text-cyan-600">מתאמן/ת עכשיו</span>
                  </div>
                ) : (
                  <span className="text-[13px] text-gray-500">נמצא/ת באזור</span>
                )}
                {marker.activity?.workoutTitle && (
                  <p className="text-[12px] text-gray-400 mt-0.5">{marker.activity.workoutTitle}</p>
                )}
              </div>

              {/* High Five button */}
              <button
                onClick={handleSend}
                disabled={isSending || sent}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-white font-extrabold text-[16px] shadow-lg transition-all active:scale-[0.97] disabled:opacity-70"
                style={{
                  background: sent
                    ? 'linear-gradient(to left, #34D399, #10B981)'
                    : 'linear-gradient(to left, #0CF2E3, #00BAF7)',
                  boxShadow: sent
                    ? '0 4px 20px rgba(16,185,129,0.3)'
                    : '0 4px 20px rgba(0,186,247,0.3)',
                }}
              >
                <span className="text-2xl">🙏</span>
                <span>{sent ? 'נשלח!' : 'High Five!'}</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
