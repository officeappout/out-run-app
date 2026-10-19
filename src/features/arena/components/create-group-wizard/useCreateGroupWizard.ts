import type React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { useUserStore } from '@/features/user';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import { createGroup, updateGroup, getGroupById } from '@/features/arena/services/group.service';
import { uploadCommunityImage } from '@/features/admin/services/community.service';
import type { ScheduleSlot } from '@/types/community.types';
import { ALWAYS_PRIVATE_TYPES, BLANK_FORM, OUTREACH_TYPES } from './wizard-constants';
import { canAdvanceStep, inviteLink, inviteShareText, resolveSubmitMeetingFields } from './wizard-logic';
import type { CreateGroupWizardProps, WizardForm, WizardSuccessInfo } from './wizard-types';

/**
 * CreateGroupWizard's state machine: form state, edit-mode prefill, step
 * navigation, submit (create / update) and the success-screen actions.
 * Hook order, effects and Firestore calls are exactly the pre-split
 * component's (see the parity suite in src/components/ui/v2/__tests__/).
 */
export function useCreateGroupWizard({ isOpen, onClose, onSuccess, editGroupId }: CreateGroupWizardProps) {
  const wizardSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(wizardSuperAdmin).flags.enableHomeV2;
  const { profile } = useUserStore();
  const access = useArenaAccess();
  const isEditMode = !!editGroupId;
  const myGender = profile?.core?.gender;

  const [step, setStep] = useState(0);
  // outreachMode: shown after StepType for institutional types before StepBasics
  const [outreachMode, setOutreachMode] = useState<'outreach' | null>(null);
  const [outreachSent, setOutreachSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<WizardSuccessInfo | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);

  // Use user's saved anchor location as map default, fall back to Jerusalem.
  const userCoords = (profile?.core?.anchorLat && profile?.core?.anchorLng)
    ? { lat: profile.core.anchorLat, lng: profile.core.anchorLng }
    : { lat: 31.7683, lng: 35.2137 };

  const [form, setForm] = useState<WizardForm>({ ...BLANK_FORM, coords: userCoords });

  // When wizard opens in create mode, sync coords to current user location
  useEffect(() => {
    if (isOpen && !editGroupId) {
      setForm((prev) => ({ ...prev, coords: userCoords }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
      // Skip StepType in edit mode — type is immutable after creation.
      setStep(1);
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

  const canAdvance = (): boolean => canAdvanceStep(step, form);

  const handleNext = () => {
    // StepType → show outreach interstitial for B2B types (work / university)
    if (step === 0 && OUTREACH_TYPES.has(form.groupType) && !outreachMode) {
      setOutreachMode('outreach');
      return;
    }
    // Leaving outreach interstitial → clear it
    if (outreachMode) { setOutreachMode(null); setOutreachSent(false); }
    // "כל אחד בקצב שלו" — skip when+where, jump straight to privacy;
    // also reset default 'running' category since it's irrelevant for league/challenge groups
    if (step === 2 && form.hasMeetups === false) {
      if (form.category === 'running') updateForm('category', 'other');
      setStep(4);
      return;
    }
    if (step < 5) setStep((s) => s + 1);
  };

  const handleBack = () => {
    // Back from outreach interstitial → return to StepType
    if (outreachMode) { setOutreachMode(null); setOutreachSent(false); return; }
    // Back from StepBasics for outreach types → show outreach again
    if (step === 1 && OUTREACH_TYPES.has(form.groupType)) {
      setOutreachMode('outreach');
      return;
    }
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
        const uploaded = await uploadCommunityImage(form.imageFile, profile.id);
        resolvedImages = [uploaded];
      } else if (form.imagePreviewUrl) {
        resolvedImages = [form.imagePreviewUrl];
      } else {
        resolvedImages = [];
      }

      // hasMeetups=false → no location, no schedule slots
      const { rulesStr, effectiveHasMeetups, effectiveSlots, effectiveLocation } =
        resolveSubmitMeetingFields(form);

      if (isEditMode && editGroupId) {
        // ── Edit Mode: update existing document ──────────────────────────────
        await updateGroup(editGroupId, {
          name: form.name.trim(),
          description: form.description.trim(),
          category: form.category,
          hasMeetups: effectiveHasMeetups,
          scheduleSlots: effectiveSlots,
          meetingLocation: effectiveLocation,
          isPublic: form.isPublic,
          allowJoinRequests: form.isPublic ? false : form.allowJoinRequests,
          rules: rulesStr,
          images: resolvedImages,
        });
        onSuccess(editGroupId);
      } else {
        // ── Create Mode: create new document + celebrate ─────────────────────
        const isSocialGroup = ALWAYS_PRIVATE_TYPES.has(form.groupType);
        // Social/institutional groups are not city-scoped; they're private by design.
        const effectiveAuthorityId = isSocialGroup ? null : authorityId;

        const { groupId, inviteCode } = await createGroup(profile.id, profile.core.name, {
          name: form.name.trim(),
          description: form.description.trim(),
          category: form.category,
          groupType: form.groupType,
          hasMeetups: effectiveHasMeetups,
          scopeId: effectiveAuthorityId,
          ...(effectiveAuthorityId ? { authorityId: effectiveAuthorityId } : {}),
          isPublic: isSocialGroup ? false : form.isPublic,
          allowJoinRequests: (isSocialGroup || form.isPublic) ? false : form.allowJoinRequests,
          scheduleSlots: effectiveSlots,
          meetingLocation: effectiveLocation,
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
    setStep(0);
    setOutreachMode(null);
    setOutreachSent(false);
    setSubmitError(null);
    setForm(BLANK_FORM);
    setSuccessInfo(null);
    setCodeCopied(false);
    onClose();
  };

  // ── Success-screen actions (shared by the old and the v2 look) ────────────

  const copySuccessCode = () => {
    if (!successInfo) return;
    const origin = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://out-run-app.vercel.app';
    navigator.clipboard
      ?.writeText(inviteLink(origin, successInfo.inviteCode))
      .catch(() => {});
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const shareSuccessCode = () => {
    if (!successInfo) return;
    const origin = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://out-run-app.vercel.app';
    const link = inviteLink(origin, successInfo.inviteCode);
    const text = inviteShareText(successInfo.name, successInfo.inviteCode, link);
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: successInfo.name, text, url: link }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const enterCreatedCommunity = () => {
    if (!successInfo) return;
    const gid = successInfo.groupId;
    setSuccessInfo(null);
    setCodeCopied(false);
    setStep(0);
    setForm(BLANK_FORM);
    onSuccess(gid);
  };

  return {
    v2,
    profile,
    access,
    isEditMode,
    myGender,
    step,
    outreachMode,
    outreachSent,
    setOutreachSent,
    submitting,
    submitError,
    successInfo,
    codeCopied,
    loadingEdit,
    form,
    slotDay,
    slotTime,
    setSlotDay,
    setSlotTime,
    fileInputRef,
    updateForm,
    addSlot,
    removeSlot,
    handleImagePick,
    canAdvance,
    handleNext,
    handleBack,
    handleCreate,
    handleClose,
    copySuccessCode,
    shareSuccessCode,
    enterCreatedCommunity,
  };
}

export type CreateGroupWizardState = ReturnType<typeof useCreateGroupWizard>;
