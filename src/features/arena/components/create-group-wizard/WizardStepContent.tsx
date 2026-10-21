'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import { StepBasics } from './StepBasics';
import { StepFinalize } from './StepFinalize';
import { StepMode } from './StepMode';
import { StepOutreach } from './StepOutreach';
import { StepPrivacy } from './StepPrivacy';
import { StepType } from './StepType';
import { StepWhenWhere } from './StepWhenWhere';
import type { CreateGroupWizardState } from './useCreateGroupWizard';

/** The scrollable body: the current step (or the outreach interstitial). */
export function WizardStepContent({ w }: { w: CreateGroupWizardState }) {
  const {
    outreachMode,
    step,
    form,
    updateForm,
    outreachSent,
    setOutreachSent,
    handleNext,
    access,
    profile,
    slotDay,
    slotTime,
    setSlotDay,
    setSlotTime,
    addSlot,
    removeSlot,
    fileInputRef,
    handleImagePick,
    submitError,
  } = w;
  const t = useT(community);
  return (
    <div className="flex-1 overflow-y-auto px-5 pb-4" dir="rtl">
      <AnimatePresence mode="wait">
        <motion.div
          key={outreachMode ?? step}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ duration: 0.18 }}
        >
          {outreachMode === 'outreach' && (
            <StepOutreach
              groupType={form.groupType}
              outreachSent={outreachSent}
              onSend={() => setOutreachSent(true)}
              onContinue={handleNext}
            />
          )}
          {!outreachMode && step === 0 && <StepType form={form} updateForm={updateForm} />}
          {step === 1 && <StepBasics form={form} updateForm={updateForm} />}
          {step === 2 && <StepMode form={form} updateForm={updateForm} />}
          {step === 3 && (
            <StepWhenWhere
              form={form}
              updateForm={updateForm}
              authorityId={access.cityAuthorityId ?? ''}
              hasRealAnchor={!!(profile?.core?.anchorLat && profile?.core?.anchorLng)}
              slotDay={slotDay}
              slotTime={slotTime}
              setSlotDay={setSlotDay}
              setSlotTime={setSlotTime}
              addSlot={addSlot}
              removeSlot={removeSlot}
            />
          )}
          {!outreachMode && step === 4 && <StepPrivacy form={form} updateForm={updateForm} />}
          {!outreachMode && step === 5 && (
            <StepFinalize
              form={form}
              fileInputRef={fileInputRef}
              onImagePick={handleImagePick}
              submitError={submitError ? t(submitError) : null}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
