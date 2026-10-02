'use client';

/**
 * usePersonalInfoEditor — shared personal-info (name/weight/DOB/city/
 * neighborhood) editing state + save logic.
 *
 * Extracted from SettingsModal.tsx's inline "פרטים אישיים" block (round 5
 * of the profile redesign) so the new Edit Profile screen can reuse the
 * EXACT same staged-edit + save behavior instead of re-implementing it.
 * SettingsModal now calls this hook too — its own rendered output is
 * unchanged, only the state/effects/handlers moved out of that file.
 *
 * Deliberately UI-agnostic: no JSX here, each caller lays out its own
 * fields/toggle-vs-always-expanded UX around this hook's state. The one
 * piece of navigation (editing the city) is exposed as `goToCityEdit` —
 * core.authorityId is client-write-locked (noTenantFieldsChanged(),
 * axioms.md §20) and routes through /explorer instead of joining this
 * hook's own staged save.
 *
 * Round 5 addition: bio + trainingTags. Approved scope is explicitly these
 * two fields only — NOT relationship-status/looking-for/18+-opt-in, which
 * stay deferred pending a dedicated round. Both are new core.* fields (see
 * user.types.ts) with no prior UI anywhere; staged/saved the same way as
 * name/weight/DOB above, in the same atomic updateDoc.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { useToast } from '@/components/ui/Toast';
import { getUserFromFirestore } from '@/lib/firestore.service';

/** Fixed vocabulary for the training-tags chip picker — first pass, easy to
 * adjust (plain string literals, no migration needed to add/remove one). */
export const TRAINING_TAG_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'loves_park', label: 'אוהב פארק' },
  { id: 'morning', label: 'בוקר' },
  { id: 'evening', label: 'מתאמן בערב' },
  { id: 'beginner', label: 'מתחיל' },
  { id: 'intermediate', label: 'רמת ביניים' },
  { id: 'advanced', label: 'מתקדם' },
  { id: 'home', label: 'בית' },
  { id: 'running', label: 'ריצה' },
  { id: 'front_lever', label: 'פרונט לבר' },
  { id: 'muscle_up', label: 'מאסל אפ' },
];

export function usePersonalInfoEditor() {
  const router = useRouter();
  const { profile } = useUserStore();
  const userId = profile?.id ?? auth.currentUser?.uid ?? null;
  const { showToast } = useToast();

  const [editName, setEditName] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editDob, setEditDob] = useState({ day: '', month: '', year: '' });
  const [editBio, setEditBio] = useState('');
  const [editTrainingTags, setEditTrainingTags] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  const toggleTrainingTag = useCallback((tagId: string) => {
    setEditTrainingTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
  }, []);

  // Neighborhood is staged like name/weight/DOB, committed together on save.
  // City stays display-only — see goToCityEdit below.
  const [neighborhoodPickerOpen, setNeighborhoodPickerOpen] = useState(false);
  const [neighborhoodName, setNeighborhoodName] = useState<string | null>(null);
  const [editNeighborhoodId, setEditNeighborhoodId] = useState<string | null>(null);
  const [editNeighborhoodName, setEditNeighborhoodName] = useState<string | null>(null);
  const cityAuthorityId = profile?.core?.authorityId ?? null;

  // Live-resolved city name (never the GPS-reverse-geocoded core.affiliations
  // field — see SettingsModal's original 19.09.2026 fix comment for why that
  // was dropped as a fallback here).
  const [resolvedCityName, setResolvedCityName] = useState<string | null>(null);
  const [cityResolving, setCityResolving] = useState(false);
  const cityDisplay = cityResolving
    ? null
    : resolvedCityName ?? (() => {
        const a = (profile?.core as unknown as { authority?: { name?: string } })?.authority;
        if (a && typeof a === 'object' && a.name) return String(a.name);
        return null;
      })();

  useEffect(() => {
    const aid = profile?.core?.authorityId;
    if (!aid) { setResolvedCityName(null); setCityResolving(false); return; }
    let cancelled = false;
    setCityResolving(true);
    getDoc(doc(db, 'authorities', aid))
      .then((snap) => { if (!cancelled) setResolvedCityName(snap.exists() ? ((snap.data()?.name as string) ?? null) : null); })
      .catch(() => { if (!cancelled) setResolvedCityName(null); })
      .finally(() => { if (!cancelled) setCityResolving(false); });
    return () => { cancelled = true; };
  }, [profile?.core?.authorityId]);

  useEffect(() => {
    const nid = profile?.core?.neighborhoodId;
    if (!nid) { setNeighborhoodName(null); return; }
    let cancelled = false;
    getDoc(doc(db, 'authorities', nid))
      .then((snap) => { if (!cancelled) setNeighborhoodName(snap.exists() ? ((snap.data()?.name as string) ?? null) : null); })
      .catch(() => { if (!cancelled) setNeighborhoodName(null); });
    return () => { cancelled = true; };
  }, [profile?.core?.neighborhoodId]);

  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  const openPersonalEdit = useCallback(() => {
    setEditName(profile?.core?.name ?? '');
    setEditWeight(profile?.core?.weight ? String(profile.core.weight) : '');
    if (profile?.core?.birthDate) {
      const d = profile.core.birthDate instanceof Date
        ? profile.core.birthDate
        : new Date(profile.core.birthDate as unknown as string);
      if (!isNaN(d.getTime())) {
        setEditDob({
          day: String(d.getDate()).padStart(2, '0'),
          month: String(d.getMonth() + 1).padStart(2, '0'),
          year: String(d.getFullYear()),
        });
      } else {
        setEditDob({ day: '', month: '', year: '' });
      }
    } else {
      setEditDob({ day: '', month: '', year: '' });
    }
    setEditNeighborhoodId(profile?.core?.neighborhoodId ?? null);
    setEditNeighborhoodName(neighborhoodName);
    setEditBio(profile?.core?.bio ?? '');
    setEditTrainingTags(profile?.core?.trainingTags ?? []);
  }, [profile, neighborhoodName]);

  const savePersonalEdit = useCallback(async () => {
    const uid = auth.currentUser?.uid ?? userId;
    if (!uid || editSaving) return false;
    setEditSaving(true);
    try {
      const update: Record<string, unknown> = {};

      const trimmedName = editName.trim();
      if (trimmedName && trimmedName !== profile?.core?.name) {
        update['core.name'] = trimmedName;
      }

      const w = parseFloat(editWeight);
      if (!isNaN(w) && w > 0 && w !== profile?.core?.weight) {
        update['core.weight'] = w;
      }

      const day = parseInt(editDob.day, 10);
      const month = parseInt(editDob.month, 10);
      const year = parseInt(editDob.year, 10);
      if (day && month && year && month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
        // Bug fix (production incident, round 8): this used to unconditionally
        // recompute and include core.birthDate on EVERY save, since editDob is
        // always pre-filled from the existing profile — meaning virtually every
        // save (even one only touching bio) resubmitted birthDate. Firestore's
        // noLockedCoreFieldsChanged() rule requires it to be byte-identical to
        // the stored value or denies the WHOLE update (permission-denied) —
        // and it almost never was: the stored value was very likely constructed
        // server-side (core/complete-profile's own `new Date(year, month-1, day)`)
        // in the SERVER's timezone, while this candidate is built in the
        // BROWSER's timezone. Same inputs, different `Date` constructor
        // timezone context — not equal.
        //
        // Deliberately comparing by CALENDAR DATE (local Y/M/D, same getters
        // openPersonalEdit already used to seed this form), NOT by raw
        // getTime() equality — comparing epoch milliseconds would reintroduce
        // this exact bug via a different path: even a genuinely-UNCHANGED
        // birthDate would still "differ" by the timezone offset once
        // reconstructed here, so a pure timestamp comparison would still
        // resubmit it on every save. Comparing the Y/M/D the user actually
        // sees/edited is immune to that cross-timezone mismatch.
        const currentBirthDate = profile?.core?.birthDate
          ? (profile.core.birthDate instanceof Date ? profile.core.birthDate : new Date(profile.core.birthDate as unknown as string))
          : null;
        const birthDateUnchanged = !!currentBirthDate
          && currentBirthDate.getFullYear() === year
          && currentBirthDate.getMonth() === month - 1
          && currentBirthDate.getDate() === day;
        if (!birthDateUnchanged) {
          update['core.birthDate'] = new Date(year, month - 1, day);
        }
      }

      if (editNeighborhoodId && editNeighborhoodId !== profile?.core?.neighborhoodId) {
        update['core.neighborhoodId'] = editNeighborhoodId;
      }

      const trimmedBio = editBio.trim();
      if (trimmedBio !== (profile?.core?.bio ?? '')) {
        update['core.bio'] = trimmedBio;
      }

      // Whole-array overwrite is correct here (not FieldValue.arrayUnion,
      // axioms.md §5's append rule) — trainingTags is a single-owner,
      // user-set-the-complete-list preference, not a shared/incrementally-
      // appended collection. The user's chip selection IS the full value.
      const currentTags = profile?.core?.trainingTags ?? [];
      const tagsChanged = editTrainingTags.length !== currentTags.length
        || editTrainingTags.some((t) => !currentTags.includes(t));
      if (tagsChanged) {
        update['core.trainingTags'] = editTrainingTags;
      }

      if (Object.keys(update).length > 0) {
        update['core.updatedAt'] = serverTimestamp();
        await updateDoc(doc(db, 'users', uid), update);
        const fresh = await getUserFromFirestore(uid);
        if (fresh) useUserStore.setState({ profile: fresh });
        showToast('success', 'הפרטים עודכנו בהצלחה');
      }
      return true;
    } catch (e) {
      console.error('[usePersonalInfoEditor] failed to save personal details', e);
      showToast('error', 'שגיאה בשמירת הפרטים');
      return false;
    } finally {
      setEditSaving(false);
    }
  }, [editName, editWeight, editDob, editNeighborhoodId, editBio, editTrainingTags, userId, profile, editSaving, showToast]);

  /** core.authorityId is client-write-locked — city editing routes through
   * /explorer (the current location-edit flow) instead of this hook's own
   * staged save. Sets the JIT return marker /explorer reads to come back here. */
  const goToCityEdit = useCallback((returnTo: string = 'profile') => {
    sessionStorage.setItem('explorer_return_to', returnTo);
    router.push('/explorer');
  }, [router]);

  return {
    profile,
    userId,
    editName, setEditName,
    editWeight, setEditWeight,
    editDob, setEditDob,
    editBio, setEditBio,
    editTrainingTags, toggleTrainingTag,
    editSaving,
    cityDisplay, cityResolving, cityAuthorityId, goToCityEdit,
    neighborhoodPickerOpen, setNeighborhoodPickerOpen,
    editNeighborhoodId, editNeighborhoodName, setEditNeighborhoodId, setEditNeighborhoodName,
    monthRef, yearRef,
    openPersonalEdit, savePersonalEdit,
  };
}
