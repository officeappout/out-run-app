'use client';

/**
 * CreateGroupWizard — create / edit a community in six steps (type → basics →
 * mode → when & where → privacy → finalize), with an outreach interstitial
 * for work / campus groups and a success screen with the invite code.
 *
 * A thin composition: state + submit live in useCreateGroupWizard, each step
 * and the chrome in ./create-group-wizard/. enable_home_v2 reaches the steps
 * through the WizardV2 context.
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useCreateGroupWizard } from './create-group-wizard/useCreateGroupWizard';
import { WizardV2 } from './create-group-wizard/wizard-v2';
import { WizardFooter } from './create-group-wizard/WizardFooter';
import { WizardHeader } from './create-group-wizard/WizardHeader';
import { WizardStepContent } from './create-group-wizard/WizardStepContent';
import { WizardSuccess } from './create-group-wizard/WizardSuccess';
import type { CreateGroupWizardProps } from './create-group-wizard/wizard-types';

export default function CreateGroupWizard({ isOpen, onClose, onSuccess, editGroupId }: CreateGroupWizardProps) {
  const w = useCreateGroupWizard({ isOpen, onClose, onSuccess, editGroupId });
  const {
    v2,
    isEditMode,
    myGender,
    step,
    outreachMode,
    successInfo,
    codeCopied,
    loadingEdit,
    form,
    submitting,
    canAdvance,
    handleNext,
    handleBack,
    handleCreate,
    handleClose,
    copySuccessCode,
    shareSuccessCode,
    enterCreatedCommunity,
  } = w;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[92] bg-black/50"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={handleClose}
          />


          {/* Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32, mass: 0.9 }}
            className={`kb-sheet fixed bottom-0 left-0 right-0 z-[93] max-w-md mx-auto bg-white flex flex-col ${v2 ? 'rounded-t-[28px] shadow-v2-sheet' : 'rounded-t-3xl shadow-2xl'}`}
            style={{ height: '92dvh' }}
          >
            <WizardV2.Provider value={v2}>
            {/* ── Header ─────────────────────────────────────────── */}
            <WizardHeader
              v2={v2}
              successInfo={successInfo}
              isEditMode={isEditMode}
              myGender={myGender}
              step={step}
              outreachMode={outreachMode}
              handleClose={handleClose}
            />

            {/* ── Edit-mode loading skeleton ──────────────────────── */}
            {loadingEdit && (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className={`w-7 h-7 animate-spin ${v2 ? 'text-v2-deep' : 'text-cyan-500'}`} />
              </div>
            )}

            {/* ── Success screen (post-creation) ──────────────────── */}
            {!loadingEdit && successInfo && (
              <WizardSuccess
                v2={v2}
                successInfo={successInfo}
                codeCopied={codeCopied}
                copySuccessCode={copySuccessCode}
                shareSuccessCode={shareSuccessCode}
                enterCreatedCommunity={enterCreatedCommunity}
              />
            )}

            {/* ── Scrollable step content ─────────────────────────── */}
            {!loadingEdit && !successInfo && (
              <>
                <WizardStepContent w={w} />

                {/* ── Footer navigation ───────────────────────────────── */}
                <WizardFooter
                  v2={v2}
                  step={step}
                  outreachMode={outreachMode}
                  form={form}
                  submitting={submitting}
                  isEditMode={isEditMode}
                  myGender={myGender}
                  canAdvance={canAdvance}
                  handleBack={handleBack}
                  handleNext={handleNext}
                  handleCreate={handleCreate}
                />
              </>
            )}
            </WizardV2.Provider>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
