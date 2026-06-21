'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import confetti from 'canvas-confetti';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Camera,
  Plus,
  Trash2,
  Loader2,
  Check,
  Lock,
  Globe,
  MapPin,
  Trees,
  Copy,
  Share2,
} from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import { createGroup, updateGroup, getGroupById } from '@/features/arena/services/group.service';
import { uploadCommunityImage } from '@/features/admin/services/community.service';
import { getParksByAuthority } from '@/features/admin/services/parks.service';
import { reverseGeocode } from '@/features/user/onboarding/components/steps/UnifiedLocation/location-utils';
import type { Park } from '@/features/parks/core/types/park.types';
import type { CommunityGroup, CommunityGroupCategory, CommunityGroupType, ScheduleSlot } from '@/types/community.types';

// Mapbox components are client-only — lazy-loaded to avoid SSR errors
const MiniLocationPicker = dynamic(
  () => import('@/features/admin/components/MiniLocationPicker'),
  { ssr: false, loading: () => <div className="h-44 w-full rounded-xl bg-gray-100 animate-pulse" /> },
);

const CommunityAddressSearch = dynamic(
  () => import('@/features/arena/components/CommunityAddressSearch'),
  { ssr: false, loading: () => <div className="h-12 w-full rounded-xl bg-gray-100 animate-pulse" /> },
);

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: CommunityGroupCategory; label: string; emoji: string }[] = [
  { value: 'running',      label: 'ריצה',       emoji: '🏃' },
  { value: 'walking',      label: 'הליכה',      emoji: '🚶' },
  { value: 'calisthenics', label: 'קליסתניקס', emoji: '💪' },
  { value: 'yoga',         label: 'יוגה',       emoji: '🧘' },
  { value: 'cycling',      label: 'רכיבה',      emoji: '🚴' },
  { value: 'other',        label: 'אחר',        emoji: '⭐' },
];

const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const STEPS = ['סוג קבוצה', 'בסיסים', 'סוג אימון', 'מתי ואיפה', 'פרטיות', 'סיום'];

// Types that are always private — no public/private toggle shown for these
const ALWAYS_PRIVATE_TYPES = new Set<CommunityGroupType>(['friends', 'family', 'work', 'school', 'university']);

// ── Form state type ───────────────────────────────────────────────────────────

interface WizardForm {
  name: string;
  description: string;
  category: CommunityGroupCategory;
  /** Group type — determines scope binding and privacy defaults. */
  groupType: CommunityGroupType;
  address: string;
  coords: { lat: number; lng: number };
  /** True once the user explicitly picks an address, park, or moves the map pin */
  locationSelected: boolean;
  scheduleSlots: ScheduleSlot[];
  isPublic: boolean;
  /** Only relevant when isPublic === false; lets non-members request to join */
  allowJoinRequests: boolean;
  rules: string;
  imageFile: File | null;
  imagePreviewUrl: string | null;
  /**
   * null  = not yet chosen (StepMode pending)
   * true  = "אימון משותף" — shows StepWhenWhere, creates group with scheduleSlots
   * false = "כל אחד בקצב שלו" — skips StepWhenWhere, hasMeetups=false in Firestore
   */
  hasMeetups: boolean | null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CreateGroupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (groupId: string) => void;
  /** When provided the wizard opens in Edit Mode, pre-filled with Firestore data */
  editGroupId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

const BLANK_FORM: WizardForm = {
  name: '',
  description: '',
  category: 'running',
  groupType: 'neighborhood',
  address: '',
  coords: { lat: 31.7683, lng: 35.2137 },
  locationSelected: false,
  scheduleSlots: [],
  isPublic: true,
  allowJoinRequests: false,
  rules: '',
  imageFile: null,
  imagePreviewUrl: null,
  hasMeetups: null,
};

export default function CreateGroupWizard({ isOpen, onClose, onSuccess, editGroupId }: CreateGroupWizardProps) {
  const { profile } = useUserStore();
  const access = useArenaAccess();
  const isEditMode = !!editGroupId;
  const myGender = profile?.core?.gender;

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    groupId: string;
    inviteCode: string;
    name: string;
    isPrivate: boolean;
  } | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);

  const [form, setForm] = useState<WizardForm>(BLANK_FORM);

  // Schedule slot builder state
  const [slotDay, setSlotDay] = useState(0);
  const [slotTime, setSlotTime] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Pre-fill form when opening in Edit Mode ───────────────────────────────
  useEffect(() => {
    if (!isOpen || !editGroupId) return;
    let cancelled = false;
    setLoadingEdit(true);
    getGroupById(editGroupId).then((group) => {
      if (cancelled || !group) return;
      const slots = group.scheduleSlots?.length
        ? group.scheduleSlots
        : group.schedule
          ? [group.schedule]
          : [];
      // hasMeetups: prefer explicit Firestore value; fall back to inferring from
      // existing scheduleSlots (legacy groups without the field).
      const inferredHasMeetups = group.hasMeetups ?? (slots.length > 0 ? true : null);
      setForm({
        name: group.name,
        description: group.description ?? '',
        category: group.category,
        groupType: group.groupType ?? 'neighborhood',
        address: group.meetingLocation?.address ?? '',
        coords: group.meetingLocation?.location ?? { lat: 31.7683, lng: 35.2137 },
        locationSelected: true,
        scheduleSlots: slots,
        isPublic: group.isPublic ?? true,
        allowJoinRequests: group.allowJoinRequests ?? false,
        rules: group.rules ?? '',
        imageFile: null,
        imagePreviewUrl: group.images?.[0] ?? null,
        hasMeetups: inferredHasMeetups,
      });
    }).catch((err) => {
      console.error('[CreateGroupWizard] failed to load group for edit:', err);
    }).finally(() => {
      if (!cancelled) setLoadingEdit(false);
    });
    return () => { cancelled = true; };
  }, [isOpen, editGroupId]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const updateForm = useCallback(<K extends keyof WizardForm>(key: K, value: WizardForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const addSlot = () => {
    if (!slotTime.match(/^\d{1,2}:\d{2}$/)) return;
    const slot: ScheduleSlot = { dayOfWeek: slotDay, time: slotTime, frequency: 'weekly' };
    updateForm('scheduleSlots', [...form.scheduleSlots, slot]);
    setSlotTime('');
  };

  const removeSlot = (i: number) => {
    updateForm('scheduleSlots', form.scheduleSlots.filter((_, idx) => idx !== i));
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setForm((prev) => ({ ...prev, imageFile: file, imagePreviewUrl: previewUrl }));
  };

  // ── Validation per step ──────────────────────────────────────────────────

  const canAdvance = (): boolean => {
    if (step === 0) return true;                                                    // StepType
    if (step === 1) return form.name.trim().length >= 2;                           // StepBasics
    if (step === 2) return form.hasMeetups !== null;                               // StepMode
    // StepWhenWhere (step 3) — optional for non-geographic types
    if (step === 3) return ALWAYS_PRIVATE_TYPES.has(form.groupType) || form.locationSelected;
    if (step === 4) return true;                                                    // StepPrivacy
    return true;
  };

  const handleNext = () => {
    // "כל אחד בקצב שלו" — skip when+where, jump straight to privacy
    if (step === 2 && form.hasMeetups === false) { setStep(4); return; }
    if (step < 5) setStep((s) => s + 1);
  };

  const handleBack = () => {
    // Coming back from privacy when hasMeetups=false — return to StepMode
    if (step === 4 && form.hasMeetups === false) { setStep(2); return; }
    if (step > 0) setStep((s) => s - 1);
    else onClose();
  };

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    // Safety assertion — the entry-point guard in CommunityPage should always
    // prevent reaching this point with an incomplete profile.
    if (!profile?.id || !profile?.core?.name) {
      console.error('[CreateGroupWizard] handleCreate reached with incomplete profile — entry guard missed');
      return;
    }
    const authorityId = access.cityAuthorityId ?? '';

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Resolve image: upload new file, or keep existing preview URL, or clear
      let resolvedImages: string[] | undefined;
      if (form.imageFile) {
        const uploaded = await uploadCommunityImage(form.imageFile);
        resolvedImages = [uploaded];
      } else if (form.imagePreviewUrl) {
        resolvedImages = [form.imagePreviewUrl];
      } else {
        resolvedImages = [];
      }

      const DEFAULT_LAT = 31.7683;
      const DEFAULT_LNG = 35.2137;
      const hasCustomCoords =
        form.coords.lat !== DEFAULT_LAT || form.coords.lng !== DEFAULT_LNG;
      const addressStr =
        form.address.trim() ||
        (hasCustomCoords ? 'מיקום ידני על המפה' : '');

      const meetingLocation =
        addressStr || hasCustomCoords
          ? {
              ...(addressStr ? { address: addressStr } : {}),
              location: { lat: form.coords.lat, lng: form.coords.lng },
            }
          : undefined;

      const rulesStr = form.rules.trim() || null;

      if (isEditMode && editGroupId) {
        // ── Edit Mode: update existing document ──────────────────────────────
        await updateGroup(editGroupId, {
          name: form.name.trim(),
          description: form.description.trim(),
          category: form.category,
          scheduleSlots: form.scheduleSlots,
          meetingLocation,
          isPublic: form.isPublic,
          allowJoinRequests: form.isPublic ? false : form.allowJoinRequests,
          rules: rulesStr,
          images: resolvedImages,
        });
        onSuccess(editGroupId);
      } else {
        // ── Create Mode: create new document + celebrate ─────────────────────
        const isSocialGroup = form.groupType === 'friends' || form.groupType === 'family';
        // Social groups (friends/family) are not city-scoped; they're private by design.
        const effectiveAuthorityId = isSocialGroup ? null : authorityId;

        const { groupId, inviteCode } = await createGroup(profile.id, profile.core.name, {
          name: form.name.trim(),
          description: form.description.trim(),
          category: form.category,
          groupType: form.groupType,
          scopeId: effectiveAuthorityId,
          ...(effectiveAuthorityId ? { authorityId: effectiveAuthorityId } : {}),
          isPublic: isSocialGroup ? false : form.isPublic,
          allowJoinRequests: (isSocialGroup || form.isPublic) ? false : form.allowJoinRequests,
          scheduleSlots: form.scheduleSlots,
          meetingLocation,
          rules: rulesStr ?? undefined,
          images: resolvedImages,
          source: 'user',
          isOfficial: false,
        });

        confetti({
          particleCount: 160,
          spread: 110,
          startVelocity: 45,
          origin: { y: 0.55 },
          colors: ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#f472b6'],
        });

        setSuccessInfo({
          groupId,
          inviteCode,
          name: form.name.trim(),
          isPrivate: isSocialGroup ? true : !form.isPublic,
        });
      }
    } catch (err) {
      console.error('[CreateGroupWizard] submit failed:', err);
      setSubmitError(isEditMode ? 'שמירת השינויים נכשלה. נסה שוב.' : 'יצירת הקבוצה נכשלה. נסה שוב.');
    } finally {
      setSubmitting(false);
    }
  }, [profile, access, form, onSuccess, isEditMode, editGroupId]);

  // ── Reset on close ───────────────────────────────────────────────────────

  const handleClose = () => {
    // Edit mode stays on step 1 (type step is irrelevant for edits).
    // Create mode resets to step 0 (type selection).
    setStep(isEditMode ? 1 : 0);
    setSubmitError(null);
    setForm(BLANK_FORM);
    setSuccessInfo(null);
    setCodeCopied(false);
    onClose();
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/50"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={handleClose}
          />


          {/* Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32, mass: 0.9 }}
            className="fixed bottom-0 left-0 right-0 z-[91] max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{ height: '92dvh' }}
          >
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex-shrink-0 px-5 pt-4 pb-3" dir="rtl">
              {/* Drag handle */}
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-gray-900">
                  {successInfo
                    ? 'הקהילה שלך באוויר! 🚀'
                    : isEditMode
                      ? t('ערוך קהילה', 'ערכי קהילה', myGender)
                      : t('צור קהילה חדשה', 'צורי קהילה חדשה', myGender)}
                </h2>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* Step progress — hidden on success screen */}
              {!successInfo && (
                <>
                  <div className="flex items-center gap-1.5">
                    {STEPS.map((label, i) => (
                      <React.Fragment key={i}>
                        <div
                          className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black transition-all ${
                            i < step
                              ? 'bg-cyan-500 text-white'
                              : i === step
                              ? 'bg-gray-900 text-white'
                              : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {i < step ? <Check className="w-3 h-3" /> : i + 1}
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className={`flex-1 h-0.5 rounded ${i < step ? 'bg-cyan-500' : 'bg-gray-100'}`} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 font-semibold mt-1.5 text-center">
                    {STEPS[step]}
                  </p>
                </>
              )}
            </div>

            {/* ── Edit-mode loading skeleton ──────────────────────── */}
            {loadingEdit && (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-cyan-500" />
              </div>
            )}

            {/* ── Success screen (post-creation) ──────────────────── */}
            {!loadingEdit && successInfo && (
              <div className="flex-1 overflow-y-auto px-5 pb-6 flex flex-col gap-5 pt-2" dir="rtl">
                <div className="text-center space-y-1">
                  <p className="text-4xl select-none">🎉</p>
                  <p className="text-sm text-gray-500 font-semibold">
                    {successInfo.isPrivate
                      ? 'שתף את קוד ההצטרפות הסודי עם המתאמנים שלך:'
                      : 'הקהילה שלך פתוחה וממתינה לחברים הראשונים!'}
                  </p>
                </div>

                {/* Invite code card — shown for private groups */}
                {successInfo.isPrivate && (
                  <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 space-y-4">
                    <div className="text-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                        קוד הצטרפות
                      </p>
                      <div className="font-mono text-4xl font-black tracking-[0.3em] text-gray-900 select-all py-2">
                        {successInfo.inviteCode}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const origin = typeof window !== 'undefined'
                            ? window.location.origin
                            : 'https://out-run-app.vercel.app';
                          navigator.clipboard
                            ?.writeText(`${origin}/join/${successInfo.inviteCode}`)
                            .catch(() => {});
                          setCodeCopied(true);
                          setTimeout(() => setCodeCopied(false), 2000);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-black transition-all active:scale-95 shadow-sm"
                      >
                        {codeCopied
                          ? <><Check className="w-4 h-4 text-emerald-500" />הועתק!</>
                          : <><Copy className="w-4 h-4" />העתק קוד</>}
                      </button>
                      <button
                        onClick={() => {
                          const origin = typeof window !== 'undefined'
                            ? window.location.origin
                            : 'https://out-run-app.vercel.app';
                          const link = `${origin}/join/${successInfo.inviteCode}`;
                          const text = `היי! הקמתי קהילה חדשה "${successInfo.name}" — בוא להצטרף! 🏃\nקוד הצטרפות: ${successInfo.inviteCode}\n${link}`;
                          if (typeof navigator !== 'undefined' && navigator.share) {
                            navigator.share({ title: successInfo.name, text, url: link }).catch(() => {});
                          } else {
                            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                          }
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-500 text-white text-sm font-black transition-all active:scale-95 shadow-lg shadow-emerald-500/25"
                      >
                        <Share2 className="w-4 h-4" />
                        שתף בוואטסאפ
                      </button>
                    </div>
                  </div>
                )}

                {/* Enter community CTA */}
                <button
                  onClick={() => {
                    const gid = successInfo.groupId;
                    setSuccessInfo(null);
                    setCodeCopied(false);
                    setStep(0);
                    setForm(BLANK_FORM);
                    onSuccess(gid);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30 transition-all active:scale-[0.97]"
                >
                  <Check className="w-4 h-4" />
                  כניסה לקהילה
                </button>
              </div>
            )}

            {/* ── Scrollable step content ─────────────────────────── */}
            {!loadingEdit && !successInfo && (
              <>
                <div className="flex-1 overflow-y-auto px-5 pb-4" dir="rtl">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 16 }}
                      transition={{ duration: 0.18 }}
                    >
                      {step === 0 && <StepType form={form} updateForm={updateForm} />}
                      {step === 1 && <StepBasics form={form} updateForm={updateForm} />}
                      {step === 2 && <StepMode form={form} updateForm={updateForm} />}
                      {step === 3 && (
                        <StepWhenWhere
                          form={form}
                          updateForm={updateForm}
                          authorityId={access.cityAuthorityId ?? ''}
                          slotDay={slotDay}
                          slotTime={slotTime}
                          setSlotDay={setSlotDay}
                          setSlotTime={setSlotTime}
                          addSlot={addSlot}
                          removeSlot={removeSlot}
                        />
                      )}
                      {step === 4 && <StepPrivacy form={form} updateForm={updateForm} />}
                      {step === 5 && (
                        <StepFinalize
                          form={form}
                          fileInputRef={fileInputRef}
                          onImagePick={handleImagePick}
                          submitError={submitError}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* ── Footer navigation ───────────────────────────────── */}
                <div
                  className="flex-shrink-0 px-5 pt-4 pb-4 border-t border-gray-100"
                  style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
                >
                  <div className="flex items-center gap-3" dir="rtl">
                    {/* Back */}
                    <button
                      onClick={handleBack}
                      className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
                    >
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>

                    {step < 5 ? (
                      <button
                        onClick={handleNext}
                        disabled={!canAdvance()}
                        className="flex-1 h-11 rounded-xl bg-gray-900 text-white text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        המשך
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={handleCreate}
                        disabled={submitting || form.name.trim().length < 2}
                        className="flex-1 h-11 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30 transition-all active:scale-[0.97] disabled:opacity-50"
                      >
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            {isEditMode
                              ? t('שמור שינויים', 'שמרי שינויים', myGender)
                              : t('צור קהילה', 'צורי קהילה', myGender)}
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Location hint — visible only on step 3 (StepWhenWhere) when no location is set */}
                  {step === 3 && form.hasMeetups === true && !form.locationSelected && !ALWAYS_PRIVATE_TYPES.has(form.groupType) && (
                    <p className="text-[11px] text-center text-amber-500 font-semibold mt-2.5 flex items-center justify-center gap-1">
                      <MapPin className="w-3 h-3" />
                      יש לבחור מיקום כדי להמשיך
                    </p>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Step sub-components ────────────────────────────────────────────────────────

/** Gender-aware text helper. Returns the female form when gender === 'female', male form otherwise. */
function t(male: string, female: string, gender?: string | null): string {
  return gender === 'female' ? female : male;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-bold text-gray-500 mb-1.5">{children}</label>;
}

// ── Step 2: Mode ─────────────────────────────────────────────────────────────

function StepMode({
  form,
  updateForm,
}: {
  form: WizardForm;
  updateForm: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;
}) {
  const options: { value: boolean; emoji: string; label: string; sub: string }[] = [
    {
      value: true,
      emoji: '🏃',
      label: 'אימון משותף',
      sub: 'מפגשים קבועים בזמן ומקום — הקבוצה מתאמנת ביחד',
    },
    {
      value: false,
      emoji: '🏆',
      label: 'כל אחד בקצב שלו',
      sub: 'ליגה, אתגר או תחרות — כל אחד מתאמן ומדווח תוצאות',
    },
  ];

  return (
    <div className="space-y-4 pt-4">
      <p className="text-xs text-gray-500 leading-relaxed">
        איך הקהילה שלך מתאמנת ביחד?
      </p>
      <div className="flex flex-col gap-3">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => updateForm('hasMeetups', opt.value)}
            className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-all active:scale-[0.98] text-right ${
              form.hasMeetups === opt.value
                ? 'border-cyan-500 bg-cyan-50'
                : 'border-gray-100 bg-gray-50 hover:border-gray-200'
            }`}
          >
            <span className="text-3xl flex-shrink-0 mt-0.5">{opt.emoji}</span>
            <div className="flex flex-col gap-0.5">
              <span className={`text-sm font-black ${form.hasMeetups === opt.value ? 'text-cyan-700' : 'text-gray-800'}`}>
                {opt.label}
              </span>
              <span className="text-[11px] text-gray-500 leading-relaxed">{opt.sub}</span>
            </div>
            {form.hasMeetups === opt.value && (
              <Check className="w-4 h-4 text-cyan-500 flex-shrink-0 mt-1 mr-auto" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 0: Type ─────────────────────────────────────────────────────────────

function StepType({
  form,
  updateForm,
}: {
  form: WizardForm;
  updateForm: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;
}) {
  const handleTypeChange = (value: CommunityGroupType) => {
    updateForm('groupType', value);
    // Always-private types force isPublic=false immediately
    updateForm('isPublic', ALWAYS_PRIVATE_TYPES.has(value) ? false : true);
  };

  return (
    <div className="space-y-4 pt-4">
      <p className="text-xs text-gray-500 leading-relaxed">בחר את סוג הקהילה שתרצה ליצור</p>
      <div className="grid grid-cols-2 gap-3">
        {GROUP_TYPES.map((gt) => (
          <button
            key={gt.value}
            type="button"
            onClick={() => handleTypeChange(gt.value)}
            className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-2xl border-2 transition-all active:scale-95 ${
              form.groupType === gt.value
                ? 'border-cyan-500 bg-cyan-50'
                : 'border-gray-100 bg-gray-50 hover:border-gray-200'
            }`}
          >
            <span className="text-2xl">{gt.emoji}</span>
            <span className="text-xs font-black text-gray-800 text-center leading-tight">{gt.label}</span>
            <span className="text-[9px] text-gray-400 text-center leading-tight">{gt.sub}</span>
          </button>
        ))}
      </div>
      {ALWAYS_PRIVATE_TYPES.has(form.groupType) && (
        <p className="text-[11px] text-cyan-600 font-semibold text-right flex items-center gap-1 justify-end">
          🔒 קבוצה פרטית — הצטרפות בקוד הזמנה בלבד
        </p>
      )}
    </div>
  );
}

// ── Step 1: Basics ────────────────────────────────────────────────────────────

const GROUP_TYPES: { value: CommunityGroupType; emoji: string; label: string; sub: string }[] = [
  { value: 'neighborhood', emoji: '🏘️', label: 'שכונה',    sub: 'קבוצת אימון מקומית' },
  { value: 'friends',      emoji: '👥', label: 'חברים',    sub: 'קבוצה פרטית לחברים' },
  { value: 'family',       emoji: '👨‍👩‍👧', label: 'משפחה',    sub: 'אתגר משפחתי' },
  { value: 'work',         emoji: '💼', label: 'עבודה',    sub: 'אתגר ספורט בעבודה' },
  { value: 'university',   emoji: '🎓', label: 'קמפוס',   sub: 'קהילת סטודנטים' },
  { value: 'park',         emoji: '🌳', label: 'פארק',     sub: 'קהילת פארק' },
  { value: 'school',       emoji: '🏫', label: 'ביה״ס',   sub: 'קהילת בית ספר' },
];

function StepBasics({
  form,
  updateForm,
}: {
  form: WizardForm;
  updateForm: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;
}) {
  return (
    <div className="space-y-5 pt-4">
      <div>
        <FieldLabel>שם הקבוצה *</FieldLabel>
        <input
          type="text"
          value={form.name}
          onChange={(e) => updateForm('name', e.target.value)}
          placeholder={
            form.groupType === 'family'  ? 'לדוגמה: אתגר ריצה משפחת כהן' :
            form.groupType === 'friends' ? 'לדוגמה: חברים רצים ביחד' :
            'לדוגמה: קבוצת ריצה שכונתית'
          }
          maxLength={60}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        />
        <p className="text-[10px] text-gray-400 mt-1 text-left">{form.name.length}/60</p>
      </div>

      <div>
        <FieldLabel>קטגוריה</FieldLabel>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => updateForm('category', cat.value)}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
                form.category === cat.value
                  ? 'border-cyan-500 bg-cyan-50'
                  : 'border-gray-100 bg-gray-50 hover:border-gray-200'
              }`}
            >
              <span className="text-2xl">{cat.emoji}</span>
              <span className="text-[11px] font-bold text-gray-700">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>תיאור קצר</FieldLabel>
        <textarea
          value={form.description}
          onChange={(e) => updateForm('description', e.target.value)}
          placeholder="ספר על הקבוצה שלך — מה עושים, מי מוזמן, מה האווירה..."
          rows={3}
          maxLength={300}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none leading-relaxed"
        />
        <p className="text-[10px] text-gray-400 mt-1 text-left">{form.description.length}/300</p>
      </div>

    </div>
  );
}

// ── Step 3: When & Where (location + schedule combined) ──────────────────────

function StepWhenWhere({
  form,
  updateForm,
  authorityId,
  slotDay,
  slotTime,
  setSlotDay,
  setSlotTime,
  addSlot,
  removeSlot,
}: {
  form: WizardForm;
  updateForm: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;
  authorityId: string;
  slotDay: number;
  slotTime: string;
  setSlotDay: (d: number) => void;
  setSlotTime: (t: string) => void;
  addSlot: () => void;
  removeSlot: (i: number) => void;
}) {
  const [parks, setParks] = React.useState<Park[]>([]);
  const [parksLoading, setParksLoading] = React.useState(false);
  const [selectedParkId, setSelectedParkId] = React.useState<string | null>(null);
  const [geocoding, setGeocoding] = React.useState(false);

  // Fetch city parks once when the step mounts
  React.useEffect(() => {
    if (!authorityId) return;
    setParksLoading(true);
    getParksByAuthority(authorityId)
      .then(setParks)
      .catch(() => setParks([]))
      .finally(() => setParksLoading(false));
  }, [authorityId]);

  // Address search → update address + coords + set locationSelected
  const handleAddressSelect = useCallback(
    ({ address, coords }: { address: string; coords: { lat: number; lng: number } }) => {
      setSelectedParkId(null);
      setForm_address(address, coords);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateForm],
  );

  // Park chip tap → fill address from park name, move pin
  const handleParkSelect = useCallback(
    (park: Park) => {
      const label = [park.name, park.address].filter(Boolean).join(', ');
      setSelectedParkId(park.id);
      setForm_address(label, { lat: park.location.lat, lng: park.location.lng });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateForm],
  );

  // Map pin click → update coords, reverse-geocode to fill address automatically
  const handleMapPinChange = useCallback(
    (coords: { lat: number; lng: number }) => {
      setSelectedParkId(null);
      updateForm('coords', coords);
      updateForm('locationSelected', true);
      setGeocoding(true);
      reverseGeocode(coords.lat, coords.lng)
        .then(({ displayName }) => {
          updateForm('address', displayName || 'מיקום על המפה');
        })
        .catch(() => {
          if (!form.address.trim()) updateForm('address', 'מיקום על המפה');
        })
        .finally(() => setGeocoding(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.address, updateForm],
  );

  // Helper that atomically sets address + coords + locationSelected
  function setForm_address(address: string, coords: { lat: number; lng: number }) {
    updateForm('address', address);
    updateForm('coords', coords);
    updateForm('locationSelected', true);
  }

  return (
    <div className="space-y-5 pt-4">
      {/* ── Address autocomplete ─────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <FieldLabel>חפש כתובת, פארק או מקום</FieldLabel>
          {geocoding && <Loader2 className="w-3.5 h-3.5 text-cyan-500 animate-spin" />}
        </div>
        <CommunityAddressSearch
          value={form.address}
          onChange={handleAddressSelect}
        />
      </div>

      {/* ── City parks list ──────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Trees className="w-3.5 h-3.5 text-emerald-500" />
          <FieldLabel>בחר מפארקים עירוניים</FieldLabel>
        </div>

        {parksLoading ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-9 w-28 flex-shrink-0 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : parks.length === 0 ? (
          <p className="text-[11px] text-gray-400 py-1">
            {authorityId ? 'לא נמצאו פארקים עירוניים' : 'הרשאת עיר לא מוגדרת'}
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1 snap-x">
            {parks.map((park) => {
              const isSelected = selectedParkId === park.id;
              return (
                <button
                  key={park.id}
                  type="button"
                  onClick={() => handleParkSelect(park)}
                  className={[
                    'flex-shrink-0 snap-start flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all active:scale-95',
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-200',
                  ].join(' ')}
                >
                  <MapPin className={`w-3 h-3 flex-shrink-0 ${isSelected ? 'text-emerald-500' : 'text-gray-400'}`} />
                  <span className="truncate max-w-[120px]">{park.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Map pin fine-tuning ──────────────────────────── */}
      <div>
        <FieldLabel>
          {form.locationSelected ? 'כיוון עדין על המפה' : 'או לחץ על המפה לסימון מיקום'}
        </FieldLabel>
        <MiniLocationPicker
          value={form.coords}
          onChange={handleMapPinChange}
        />
        <p className="text-[10px] text-gray-400 mt-1.5">
          לחץ על המפה כדי לדייק את הפין
        </p>
      </div>

      {/* ── Schedule ─────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-5 space-y-4">
        <div>
          <FieldLabel>יום בשבוע</FieldLabel>
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSlotDay(i)}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                  slotDay === i
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>שעה</FieldLabel>
          <div className="flex gap-2">
            <input
              type="time"
              value={slotTime}
              onChange={(e) => setSlotTime(e.target.value)}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
            <button
              type="button"
              onClick={addSlot}
              disabled={!slotTime.match(/^\d{1,2}:\d{2}$/)}
              className="px-4 py-3 rounded-xl bg-cyan-500 text-white text-sm font-black flex items-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              הוסף
            </button>
          </div>
        </div>

        {form.scheduleSlots.length > 0 && (
          <div className="space-y-2">
            <FieldLabel>מועדים שנבחרו</FieldLabel>
            {form.scheduleSlots.map((slot, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-100"
              >
                <span className="text-sm font-bold text-gray-800">
                  יום {DAYS_FULL[slot.dayOfWeek]} · {slot.time}
                </span>
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  className="p-1.5 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {form.scheduleSlots.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-1">
            ניתן להמשיך ללא לוח זמנים ולעדכן מאוחר יותר
          </p>
        )}
      </div>
    </div>
  );
}

const DAYS_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ── Step 4: Privacy & Rules ───────────────────────────────────────────────────

function StepPrivacy({
  form,
  updateForm,
}: {
  form: WizardForm;
  updateForm: <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;
}) {
  const isAlwaysPrivate = ALWAYS_PRIVATE_TYPES.has(form.groupType);

  return (
    <div className="space-y-5 pt-4">
      {/* Public / Private toggle — hidden for always-private types */}
      {isAlwaysPrivate ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-cyan-50 border border-cyan-100">
          <Lock className="w-5 h-5 text-cyan-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-black text-gray-800">קבוצה פרטית</p>
            <p className="text-[11px] text-gray-500 mt-0.5">הצטרפות בקוד הזמנה בלבד — מתאים לסוג קבוצה זה</p>
          </div>
        </div>
      ) : (
        <div>
          <FieldLabel>פרטיות</FieldLabel>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: true,  icon: <Globe className="w-5 h-5" />, label: 'ציבורי', sub: 'כולם יכולים להצטרף' },
              { value: false, icon: <Lock className="w-5 h-5" />,  label: 'פרטי',   sub: 'הצטרפות בקוד הזמנה' },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  updateForm('isPublic', opt.value);
                  if (opt.value) updateForm('allowJoinRequests', false);
                }}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                  form.isPublic === opt.value
                    ? 'border-cyan-500 bg-cyan-50'
                    : 'border-gray-100 bg-gray-50'
                }`}
              >
                <span className={form.isPublic === opt.value ? 'text-cyan-500' : 'text-gray-400'}>
                  {opt.icon}
                </span>
                <span className="text-sm font-black text-gray-800">{opt.label}</span>
                <span className="text-[10px] text-gray-500 text-center leading-tight">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Join requests — only for non-always-private groups that chose private */}
      {!isAlwaysPrivate && !form.isPublic && (
        <div>
          <FieldLabel>אפשר לבקש להצטרף?</FieldLabel>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: true,  label: 'כן', sub: 'אנשים יכולים לשלוח בקשה' },
              { value: false, label: 'לא', sub: 'הצטרפות בקוד הזמנה בלבד' },
            ] as const).map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => updateForm('allowJoinRequests', opt.value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  form.allowJoinRequests === opt.value
                    ? 'border-cyan-500 bg-cyan-50'
                    : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                }`}
              >
                <span className="text-sm font-black text-gray-800">{opt.label}</span>
                <span className="text-[9px] text-gray-400 text-center leading-tight">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rules */}
      <div>
        <FieldLabel>כללי הקהילה (אופציונלי)</FieldLabel>
        <textarea
          value={form.rules}
          onChange={(e) => updateForm('rules', e.target.value)}
          placeholder={'לדוגמה:\n• נא להגיע עם מים\n• כבוד הדדי\n• מוזמן לשתף חברים'}
          rows={5}
          maxLength={500}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none leading-relaxed"
        />
        <p className="text-[10px] text-gray-400 mt-1 text-left">{form.rules.length}/500</p>
      </div>
    </div>
  );
}

// ── Step 5: Finalize ──────────────────────────────────────────────────────────

function StepFinalize({
  form,
  fileInputRef,
  onImagePick,
  submitError,
}: {
  form: WizardForm;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImagePick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  submitError: string | null;
}) {
  return (
    <div className="space-y-5 pt-4">
      <div>
        <FieldLabel>תמונת כותרת (אופציונלי)</FieldLabel>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`w-full h-44 rounded-2xl border-2 border-dashed overflow-hidden flex items-center justify-center transition-all active:scale-[0.98] ${
            form.imagePreviewUrl ? 'border-transparent' : 'border-gray-200 hover:border-cyan-300 bg-gray-50'
          }`}
        >
          {form.imagePreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.imagePreviewUrl}
              alt="תצוגה מקדימה"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Camera className="w-8 h-8" />
              <span className="text-xs font-bold">לחץ להוספת תמונה</span>
            </div>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onImagePick}
        />
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-100">
        <p className="text-xs font-bold text-gray-500 mb-3">סיכום</p>
        <SummaryRow label="שם" value={form.name || '—'} />
        <SummaryRow label="קטגוריה" value={CATEGORIES.find((c) => c.value === form.category)?.label ?? '—'} />
        <SummaryRow
          label="מיקום"
          value={
            form.address.trim()
              ? form.address.split(',').slice(0, 2).join(',').trim()
              : 'לא נבחר מיקום'
          }
        />
        <SummaryRow
          label="מפגשים"
          value={
            form.scheduleSlots.length
              ? `${form.scheduleSlots.length} מועדים`
              : 'לא הוגדרו'
          }
        />
        <SummaryRow label="פרטיות" value={form.isPublic ? 'ציבורי' : 'פרטי'} />
      </div>

      {submitError && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-semibold text-center">
          {submitError}
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500 font-semibold">{label}</span>
      <span className="text-gray-800 font-bold">{value}</span>
    </div>
  );
}
