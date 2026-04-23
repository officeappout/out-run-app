'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import Step1LocationPicker from './Step1LocationPicker';
import Step2Details from './Step2Details';
import Step3Photo from './Step3Photo';
import { createContribution } from '@/features/parks/core/services/contribution.service';
import { useUserStore } from '@/features/user';
import { XP_REWARDS } from '@/types/contribution.types';
import type { ParkFacilityCategory, ParkFeatureTag } from '@/features/parks/core/types/park.types';

interface ContributionWizardProps {
  isOpen: boolean;
  onClose: () => void;
  initialLocation?: { lat: number; lng: number } | null;
}

export interface WizardData {
  location: { lat: number; lng: number } | null;
  isPointOfInterest: boolean;
  parkName: string;
  facilityType: ParkFacilityCategory | null;
  featureTags: ParkFeatureTag[];
  photoUrl: string | null;
}

const STEPS = ['מיקום', 'פרטים', 'תמונה'];

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
};

export default function ContributionWizard({ isOpen, onClose, initialLocation }: ContributionWizardProps) {
  const { profile } = useUserStore();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [data, setData] = useState<WizardData>({
    location: initialLocation ?? null,
    isPointOfInterest: false,
    parkName: '',
    facilityType: null,
    featureTags: [],
    photoUrl: null,
  });

  const updateData = useCallback((partial: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  }, []);

  const goNext = useCallback(() => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!data.location || !profile?.id) return;
    setSubmitting(true);
    try {
      await createContribution({
        userId: profile.id,
        type: 'new_location',
        status: 'pending',
        location: data.location,
        parkName: data.parkName || 'מיקום חדש',
        facilityType: data.facilityType ?? undefined,
        featureTags: data.featureTags,
        isPointOfInterest: data.isPointOfInterest,
        photoUrl: data.photoUrl ?? undefined,
      });
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
        setStep(0);
        setData({
          location: null,
          isPointOfInterest: false,
          parkName: '',
          facilityType: null,
          featureTags: [],
          photoUrl: null,
        });
      }, 2200);
    } catch (err) {
      console.error('[ContributionWizard] Submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  }, [data, profile?.id, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-bold text-slate-900">הוסף מיקום חדש</h2>
          <button onClick={onClose} className="p-2 rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-transform">
            <X size={18} />
          </button>
        </div>

        {/* Step Dots */}
        <div className="flex items-center justify-center gap-2 pb-4">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                i === step ? 'bg-[#00E5FF] scale-125' : i < step ? 'bg-emerald-400' : 'bg-slate-200'
              }`} />
              <span className={`text-[10px] font-medium transition-colors ${
                i === step ? 'text-slate-900' : 'text-slate-400'
              }`}>{label}</span>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-slate-200" />}
            </div>
          ))}
        </div>

        {/* Success overlay */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white rounded-t-3xl"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                transition={{ duration: 0.5 }}
                className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-4"
              >
                <span className="text-4xl">🎉</span>
              </motion.div>
              <p className="text-slate-900 text-lg font-bold mb-1">המיקום נשלח לאישור!</p>
              <p className="text-[#00E5FF] text-sm font-bold">+{XP_REWARDS.new_location} XP</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step Content */}
        <div className="flex-1 overflow-hidden relative min-h-[420px]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="absolute inset-0"
            >
              {step === 0 && (
                <Step1LocationPicker
                  data={data}
                  updateData={updateData}
                  onNext={goNext}
                />
              )}
              {step === 1 && (
                <Step2Details
                  data={data}
                  updateData={updateData}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}
              {step === 2 && (
                <Step3Photo
                  data={data}
                  updateData={updateData}
                  onBack={goBack}
                  onSubmit={handleSubmit}
                  submitting={submitting}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
