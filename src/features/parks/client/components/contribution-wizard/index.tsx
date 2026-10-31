'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, PartyPopper } from 'lucide-react';
import Step1LocationPicker from './Step1LocationPicker';
import Step2Details from './Step2Details';
import StepEquipment from './StepEquipment';
import Step3Photo from './Step3Photo';
import { createContribution } from '@/features/parks/core/services/contribution.service';
import { useUserStore } from '@/features/user';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { WizardV2Context } from './wizard-v2';
import { indicatorStepIds, wizardStepIds, type StepId } from './wizard-steps';
import Sheet from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { XP_REWARDS } from '@/types/contribution.types';
import type { ParkFacilityCategory, ParkFeatureTag } from '@/features/parks/core/types/park.types';
import type { ParkGymEquipment } from '@/features/content/equipment/gym';
import { useT } from '@/hooks/useT';
import { useToast } from '@/components/ui/Toast';
import { useEquipmentScanV1 } from '@/hooks/useEquipmentScanV1';
import { useParkScan } from '../equipment-scan/useParkScan';
import { prefillFromScan } from '../equipment-scan/park-scan-mapping';
import { submitScanContribution } from '../equipment-scan/scan-submit';
import StepScanCapture from '../equipment-scan/StepScanCapture';
import StepScanSend from '../equipment-scan/StepScanSend';
import { useParkCatalog } from '../equipment-scan/useParkCatalog';
import { map } from '@/messages/ns/map';

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
  /** Park equipment the user tagged (gym_park only). brandName is always ''. */
  gymEquipment: ParkGymEquipment[];
  photoUrl: string | null;
  /**
   * Storage path of the currently uploaded photo (e.g.
   * `contribution-photos/{uid}/{ts}_{name}`). Tracked separately from
   * `photoUrl` so Step3Photo can call `deleteObject(path)` when the user
   * removes or replaces the photo, preventing orphaned objects in
   * Firebase Storage. Always reset to null when `photoUrl` is cleared.
   */
  photoStoragePath: string | null;
  /** Camera scan park mapping (enable_equipment_scan_v1): צילום · מיקום · מתקנים · שליחה. */
  scanMode?: boolean;
}

const STEP_LABEL_KEYS = {
  location: 'wizard.step.location',
  details: 'wizard.step.details',
  equipment: 'wizard.step.equipment',
  photo: 'wizard.step.photo',
  scan: 'wizard.step.scan',
  send: 'wizard.step.send',
} as const satisfies Record<StepId, string>;

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
};

export default function ContributionWizard({ isOpen, onClose, initialLocation }: ContributionWizardProps) {
  const t = useT(map);
  const { profile } = useUserStore();
  // Home v2 (enable_home_v2): styling only — the steps read it via WizardV2Context.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
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
    gymEquipment: [],
    photoUrl: null,
    photoStoragePath: null,
    scanMode: false,
  });

  const updateData = useCallback((partial: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  }, []);

  // The "equipment" step is inserted only for gym_park, before the photo step.
  const stepIds = useMemo<StepId[]>(
    () => wizardStepIds(data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.facilityType, data.scanMode],
  );

  // Camera scan park mapping: the photos live here so they survive moving between steps.
  const scanOn = useEquipmentScanV1() && v2;
  const { showToast } = useToast();
  const onCameraDenied = useCallback(() => showToast('error', t('scan.permission')), [showToast, t]);
  const parkScan = useParkScan(onCameraDenied);
  const scanPrefill = useMemo(() => prefillFromScan(parkScan.results), [parkScan.results]);
  const { catalog: scanCatalog } = useParkCatalog((t as { locale?: string }).locale ?? 'he', data.scanMode);
  const equipmentNames = useMemo(() => Object.fromEntries(scanCatalog.map((e) => [e.id, e.name])) as Record<string, string>, [scanCatalog]);
  const startScan = useCallback(() => {
    setDirection(1);
    setStep(0);
    updateData({ scanMode: true, facilityType: 'gym_park', isPointOfInterest: false });
  }, [updateData]);
  const exitScan = useCallback(() => {
    setDirection(-1);
    setStep(0);
    updateData({ scanMode: false, facilityType: null });
  }, [updateData]);
  // v2 indicator: counts the equipment step from the start while a park's type
  // is still open, so it doesn't jump 3 → 4 mid-flow (wizard-steps.ts).
  const v2IndicatorIds = indicatorStepIds(data, step);
  const currentId = stepIds[Math.min(step, stepIds.length - 1)];

  // If the step list shrinks (e.g. gym_park → court on the details step), keep
  // `step` in range so the dots and content never point past the array.
  useEffect(() => {
    setStep((s) => Math.min(s, stepIds.length - 1));
  }, [stepIds.length]);

  const goNext = useCallback(() => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, stepIds.length - 1));
  }, [stepIds.length]);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!data.location || !profile?.id) return;
    setSubmitting(true);
    try {
      if (data.scanMode) {
        await submitScanContribution({
          uid: profile.id,
          location: data.location,
          parkName: data.parkName.trim() || t('wizard.scan.place.fallbackName'),
          gymEquipment: data.gymEquipment,
          featureTags: data.featureTags,
          shots: parkScan.shots,
          prefill: scanPrefill,
        });
      } else await createContribution({
        userId: profile.id,
        type: 'new_location',
        status: 'pending',
        location: data.location,
        parkName: data.parkName || 'מיקום חדש', // i18n-allow-hebrew: data — fallback name written to the contribution doc
        facilityType: data.facilityType ?? undefined,
        featureTags: data.featureTags,
        isPointOfInterest: data.isPointOfInterest,
        photoUrl: data.photoUrl ?? undefined,
        // Equipment only for gym_park, and only when the user actually picked some.
        ...(data.facilityType === 'gym_park' && data.gymEquipment.length > 0
          ? { gymEquipment: data.gymEquipment }
          : {}),
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
          gymEquipment: [],
          photoUrl: null,
          photoStoragePath: null,
          scanMode: false,
        });
      }, 2200);
    } catch (err) {
      console.error('[ContributionWizard] Submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  }, [data, profile?.id, onClose, parkScan.shots, scanPrefill, t]);

  if (!isOpen) return null;

  const body = (
    <>
      {/* Success overlay */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className={v2
              ? 'absolute inset-0 z-50 flex flex-col items-center justify-center rounded-t-[28px] bg-white'
              : 'absolute inset-0 z-50 flex flex-col items-center justify-center bg-white rounded-t-3xl'}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.3, 1] }}
              transition={{ duration: 0.5 }}
              className={v2
                ? 'mb-4 grid h-20 w-20 place-items-center rounded-full bg-v2-tint ring-1 ring-inset ring-v2-accent/40'
                : 'w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-4'}
            >
              {v2 ? <PartyPopper size={36} strokeWidth={2.2} className="text-v2-deep" /> : <span className="text-4xl">🎉</span>}
            </motion.div>
            <p className={v2 ? 'mb-1 text-[22px] font-black !tracking-[-0.02em] text-v2-ink' : 'text-slate-900 text-lg font-bold mb-1'}>{t('wizard.success.title')}</p>
            <p className={v2 ? 'text-[15px] font-extrabold text-v2-deep' : 'text-[#00E5FF] text-sm font-bold'}>+{XP_REWARDS.new_location} XP</p>
            {data.scanMode && (
              <p className="mt-4 rounded-full bg-v2-tint px-4 py-2 text-[13.5px] font-extrabold text-v2-deep">{t('wizard.scan.community.title')}</p>
            )}
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
            {currentId === 'scan' && (
              <StepScanCapture
                scan={parkScan}
                onBack={exitScan}
                onNext={() => {
                  const fix = parkScan.fix;
                  updateData({
                    location: fix ? { lat: fix.lat, lng: fix.lng } : data.location,
                    gymEquipment: scanPrefill.equipmentIds.map((equipmentId) => ({ equipmentId, brandName: '' })),
                    featureTags: Array.from(new Set([...data.featureTags, ...scanPrefill.featureTags])),
                  });
                  goNext();
                }}
              />
            )}
            {currentId === 'location' && (
              <Step1LocationPicker
                data={data}
                updateData={updateData}
                onNext={goNext}
                onBack={data.scanMode ? goBack : undefined}
                onStartScan={scanOn && !data.scanMode ? startScan : undefined}
                scanAccuracy={data.scanMode ? parkScan.fix?.accuracy ?? null : undefined}
              />
            )}
            {currentId === 'details' && (
              <Step2Details
                data={data}
                updateData={updateData}
                onNext={goNext}
                onBack={goBack}
              />
            )}
            {currentId === 'equipment' && (
              <StepEquipment
                data={data}
                updateData={updateData}
                onNext={goNext}
                onBack={goBack}
                scanTags={data.scanMode ? { detected: scanPrefill.equipmentIds, unsure: scanPrefill.unsureIds } : undefined}
              />
            )}
            {currentId === 'send' && (
              <StepScanSend
                parkName={data.parkName.trim() || t('wizard.scan.place.fallbackName')}
                photos={parkScan.shots.filter((s) => s.base64).length}
                equipmentNames={data.gymEquipment.map((g) => equipmentNames[g.equipmentId]).filter(Boolean)}
                unknownCount={scanPrefill.unknown.length}
                mapperName={(profile?.core?.name ?? '').trim().split(/\s+/)[0] ?? ''}
                submitting={submitting}
                onBack={goBack}
                onSubmit={handleSubmit}
              />
            )}
            {currentId === 'photo' && (
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
    </>
  );

  if (v2) {
    return (
      <WizardV2Context.Provider value={v2}>
        <Sheet
          open={isOpen}
          onClose={onClose}
          // Full-screen overlay band z-[100] (.cursorrules), in place, keyboard-aware (inputs).
          layout="nested"
          zIndex={SHEET_Z.overlay}
          portal={false}
          backdropClassName="bg-black/30 backdrop-blur-sm"
          frameClassName="w-full"
          safeArea={false}
          scroll="none"
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          // min-h-[85vh] / max-h-[95vh]: see the classic panel below (field-test finding 23.09.2026).
          className="relative flex min-h-[85vh] max-h-[95vh] flex-col overflow-hidden"
          grabberClassName="flex justify-center pt-2.5"
          ariaLabel={t('wizard.title')}
          header={
            <>
              <div className="flex items-center justify-between px-5 pt-3 pb-3">
                <h2 className="whitespace-nowrap text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{data.scanMode ? t('wizard.scan.title') : t('wizard.title')}</h2>
                <IconButton aria-label={t('wizard.close')} tone="surface" size={36} onClick={onClose}>
                  <X size={18} strokeWidth={2.4} />
                </IconButton>
              </div>
              {/* Step indicator — current = gradient dot, done = tint, upcoming = ring */}
              <div className="flex items-center justify-center gap-1 px-4 pb-4">
                {v2IndicatorIds.map((id, i) => {
                  const state = i === step ? 'current' : i < step ? 'done' : 'upcoming';
                  return (
                    <div key={id} className="flex items-center gap-1">
                      <div
                        className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-[11px] font-extrabold transition-all duration-300 ease-v2 ${
                          state === 'current'
                            ? 'bg-v2-cta text-v2-on-cta shadow-v2-cta'
                            : state === 'done'
                              ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
                              : 'bg-v2-surface text-v2-muted ring-1 ring-inset ring-v2-pill-border'
                        }`}
                      >
                        {state === 'done' ? <Check size={13} strokeWidth={3} /> : i + 1}
                      </div>
                      <span className={`whitespace-nowrap text-[12px] font-extrabold transition-colors ${
                        state === 'current' ? 'text-v2-ink' : state === 'done' ? 'text-v2-deep' : 'text-v2-muted'
                      }`}>{t(STEP_LABEL_KEYS[id])}</span>
                      {i < v2IndicatorIds.length - 1 && (
                        <div className={`mx-0.5 h-0.5 w-3 rounded-full ${i < step ? 'bg-v2-accent/40' : 'bg-v2-hairline'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          }
        >
          {body}
        </Sheet>
      </WizardV2Context.Provider>
    );
  }

  return (
    <WizardV2Context.Provider value={v2}>
    <div className="kb-fit fixed inset-0 z-[100] flex flex-col justify-end">
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
        // min-h-[85vh]: field-test finding (23.09.2026) — the sheet only grows to
        // fit its content up to the max-h cap, so a short step (Details, Photo)
        // renders visibly low regardless of that cap. Same fix shape
        // PersonaQuestionsDrawer already validated on-device for the same
        // symptom (min-h-[80vh]), applied unconditionally here rather than
        // gated on keyboard focus, since the complaint was about baseline
        // height, not specifically the keyboard. max-h raised 92vh → 95vh —
        // still short of full-screen so the backdrop stays visible and the
        // sheet reads as dismissible.
        className="kb-cap relative bg-white rounded-t-3xl shadow-2xl min-h-[85vh] max-h-[95vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-bold text-slate-900">{t('wizard.title')}</h2>
          <button onClick={onClose} className="p-2 rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-transform">
            <X size={18} />
          </button>
        </div>

        {/* Step Dots */}
        <div className="flex items-center justify-center gap-2 pb-4">
          {stepIds.map((id, i) => (
            <div key={id} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                i === step ? 'bg-[#00E5FF] scale-125' : i < step ? 'bg-emerald-400' : 'bg-slate-200'
              }`} />
              <span className={`text-[10px] font-medium transition-colors ${
                i === step ? 'text-slate-900' : 'text-slate-400'
              }`}>{t(STEP_LABEL_KEYS[id])}</span>
              {i < stepIds.length - 1 && <div className="w-6 h-px bg-slate-200" />}
            </div>
          ))}
        </div>

        {body}
      </motion.div>
    </div>
    </WizardV2Context.Provider>
  );
}
