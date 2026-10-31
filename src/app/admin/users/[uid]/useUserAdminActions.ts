'use client';

import { useState } from 'react';
import { getUserDetails, type AdminUserListItem } from '@/features/admin/services/users.service';
import type { UserFullProfile } from '@/types/user-profile';
import { MASTER_PROGRAM_ID_TO_SLUG, type Program } from '@/features/content/programs';
import { resolveTrackSlug } from '../shared.utils';
import { useCleanLegacyPrograms } from './useCleanLegacyPrograms';

/**
 * Manual level / program admin actions for the user detail page.
 * Moved verbatim out of page.tsx (I1 tabs refactor, 31.10.2026): same
 * Firestore writes, same local-state updates, same sync messages.
 */
export function useUserAdminActions({
  user,
  fullProfile,
  programs,
  setFullProfile,
  setSyncMessage,
}: {
  user: AdminUserListItem | null;
  fullProfile: UserFullProfile | null;
  programs: Program[];
  setFullProfile: (p: UserFullProfile | null) => void;
  setSyncMessage: (m: string | null) => void;
}) {
  const [editingDomains, setEditingDomains] = useState(false);
  const [editLevels, setEditLevels] = useState<Record<string, number>>({});
  const [editPercents, setEditPercents] = useState<Record<string, number>>({});
  const [savingLevels, setSavingLevels] = useState(false);
  const [showProgramPicker, setShowProgramPicker] = useState(false);
  const { cleaningLegacy, cleanLegacyActivePrograms } = useCleanLegacyPrograms({ fullProfile, setFullProfile, setSyncMessage });

  // ── Save manual level overrides (dual-write to tracks + domains) ────────
  const saveManualLevelOverrides = async (
    levelMap: Record<string, number>,
    target: 'domains' | 'tracks' | 'both',
    percentMap?: Record<string, number>,
  ) => {
    if (!user || !fullProfile) return;
    setSavingLevels(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const firestoreUpdates: Record<string, any> = {};
      for (const [key, level] of Object.entries(levelMap)) {
        if (target === 'domains' || target === 'both') {
          firestoreUpdates[`progression.domains.${key}.currentLevel`] = level;
        }
        if (target === 'tracks' || target === 'both') {
          firestoreUpdates[`progression.tracks.${key}.currentLevel`] = level;
        }
      }

      // Write percent values to tracks (percent lives only on tracks, not domains)
      if (percentMap && (target === 'tracks' || target === 'both')) {
        for (const [key, pct] of Object.entries(percentMap)) {
          firestoreUpdates[`progression.tracks.${key}.percent`] = Math.min(100, Math.max(0, pct));
        }
      }

      // Auto-derive master program levels from their child tracks.
      // full_body: Avg(push, pull, legs) — core excluded, capped at 15.
      if (target === 'tracks' || target === 'both') {
        const MASTER_EXCLUDED: Record<string, string[]> = { full_body: ['core'] };
        const MASTER_CAP: Record<string, number> = { full_body: 15 };
        const existingTracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number }> | undefined;
        for (const masterProg of programs.filter(p => p.isMaster && p.subPrograms?.length)) {
          const excluded = MASTER_EXCLUDED[masterProg.id] ?? [];
          const childLevels = (masterProg.subPrograms ?? [])
            .filter(s => !excluded.includes(s))
            .map(s => levelMap[s] ?? existingTracks?.[s]?.currentLevel ?? 0)
            .filter(l => l > 0);
          if (childLevels.length > 0) {
            const cap = MASTER_CAP[masterProg.id] ?? Infinity;
            const derivedLevel = Math.min(cap, Math.round(childLevels.reduce((a, b) => a + b, 0) / childLevels.length));
            // Stage 7 fix: write the resolved slug key, not the raw hash.
            const masterKey = await resolveTrackSlug(masterProg.id);
            firestoreUpdates[`progression.tracks.${masterKey}.currentLevel`] = derivedLevel;
            firestoreUpdates[`progression.domains.${masterKey}.currentLevel`] = derivedLevel;
          }
        }
      }

      await updateDoc(doc(db, 'users', user.id), firestoreUpdates);

      // Update local state
      const updatedProfile = { ...fullProfile };
      const prog = updatedProfile.progression as any;
      for (const [key, level] of Object.entries(levelMap)) {
        if ((target === 'domains' || target === 'both') && prog?.domains?.[key]) {
          prog.domains[key].currentLevel = level;
        }
        if ((target === 'tracks' || target === 'both') && prog?.tracks?.[key]) {
          prog.tracks[key].currentLevel = level;
        }
      }
      if (percentMap && (target === 'tracks' || target === 'both')) {
        for (const [key, pct] of Object.entries(percentMap)) {
          if (prog?.tracks?.[key]) {
            prog.tracks[key].percent = pct;
          }
        }
      }
      setFullProfile(updatedProfile);
      setEditingDomains(false);
      setEditPercents({});
      setSyncMessage('רמות עודכנו בהצלחה ✓');
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err) {
      console.error('[AdminEdit] Failed to save levels:', err);
      setSyncMessage('שגיאה בשמירה');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setSavingLevels(false);
    }
  };

  // ── Assign new program to user ──────────────────────────────────────────
  const assignProgramToUser = async (program: Program) => {
    if (!user || !fullProfile) return;
    setSavingLevels(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      // Compute smart initial level from existing tracks
      const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number }> | undefined;
      const domains = (fullProfile.progression as any)?.domains as Record<string, { currentLevel?: number }> | undefined;
      let globalLevel = 1;
      if (tracks) {
        const lvls = Object.values(tracks).map(t => t?.currentLevel ?? 0);
        globalLevel = Math.max(globalLevel, ...lvls);
      }
      if (domains) {
        const lvls = Object.values(domains).map(d => d?.currentLevel ?? 0);
        globalLevel = Math.max(globalLevel, ...lvls);
      }
      globalLevel = Math.max(globalLevel, (fullProfile.progression as any)?.globalLevel ?? 1);

      const maxLevel = (program as any).maxLevels ?? 25;
      const initialLevel = Math.min(globalLevel, maxLevel);

      // Resolve the program's semantic slug so that domains/tracks use slug
      // keys (e.g. 'full_body') instead of Firestore hash IDs. Stage 7 fix
      // (program-identity audit §06): Program.slug now takes priority — the
      // old formula skipped it entirely, the same backwards-priority bug
      // Stage 6 fixed in buildProgramSlugMap. `program` is the full,
      // already-fetched Program doc, so this is a direct field read, no
      // async resolver call needed.
      const programSlug: string =
        program.slug ||
        (program as any).movementPattern ||
        MASTER_PROGRAM_ID_TO_SLUG[program.id] ||
        program.id; // safe fallback — at least consistent with itself

      const firestoreUpdates: Record<string, any> = {
        'progression.activePrograms': [{
          id: programSlug,
          templateId: programSlug,
          name: typeof program.name === 'string' ? program.name : (program.name as any)?.he ?? program.id,
          startDate: new Date(),
          durationWeeks: 52,
          currentWeek: 1,
          focusDomains: (program as any).subPrograms ?? [],
        }],
        [`progression.tracks.${programSlug}.currentLevel`]: initialLevel,
        [`progression.tracks.${programSlug}.maxLevel`]: maxLevel,
        [`progression.tracks.${programSlug}.percent`]: 0,
        [`progression.tracks.${programSlug}.totalWorkoutsCompleted`]: 0,
        [`progression.domains.${programSlug}.currentLevel`]: initialLevel,
        [`progression.domains.${programSlug}.maxLevel`]: maxLevel,
      };

      // If program has subPrograms (e.g. push, pull, legs, core), init each.
      // subPrograms[] stores Firestore hash IDs — resolve each to its slug so
      // progression.tracks and progression.domains use consistent slug keys.
      //
      // Stage 7 fix (program-identity audit §06 — the write-time site this
      // stage prioritizes): MASTER_PROGRAM_ID_TO_SLUG only covers the 4
      // MASTER programs, never leaf children (push/pull/legs/core/skills) —
      // every subHash here is a leaf child, so the old `|| subHash` fallback
      // fired on EVERY enroll, writing a brand-new raw-hash-keyed entry each
      // time. resolveTrackSlug (resolveToSlug first) actually covers leaves.
      if ((program as any).subPrograms?.length) {
        for (const subHash of (program as any).subPrograms as string[]) {
          const subSlug = await resolveTrackSlug(subHash);
          firestoreUpdates[`progression.tracks.${subSlug}.currentLevel`] = initialLevel;
          firestoreUpdates[`progression.tracks.${subSlug}.maxLevel`] = maxLevel;
          firestoreUpdates[`progression.tracks.${subSlug}.percent`] = 0;
          firestoreUpdates[`progression.domains.${subSlug}.currentLevel`] = initialLevel;
          firestoreUpdates[`progression.domains.${subSlug}.maxLevel`] = maxLevel;
        }
      }

      await updateDoc(doc(db, 'users', user.id), firestoreUpdates);

      // Refresh profile
      const updatedProfile = await getUserDetails(user.id);
      setFullProfile(updatedProfile);
      setShowProgramPicker(false);

      const pName = typeof program.name === 'string' ? program.name : (program.name as any)?.he ?? program.id;
      setSyncMessage(`תוכנית "${pName}" הוקצתה ברמה ${initialLevel} ✓`);
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err) {
      console.error('[AdminProgram] Failed to assign program:', err);
      setSyncMessage('שגיאה בהקצאת תוכנית');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setSavingLevels(false);
    }
  };

  // ── Remove active program from user ────────────────────────────────────
  const removeActiveProgram = async (programId: string) => {
    if (!user || !fullProfile) return;
    setSavingLevels(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const remaining = (fullProfile.progression?.activePrograms ?? []).filter(
        ap => ap.id !== programId && ap.templateId !== programId,
      );
      await updateDoc(doc(db, 'users', user.id), {
        'progression.activePrograms': remaining,
      });
      const updatedProfile = { ...fullProfile };
      (updatedProfile.progression as any).activePrograms = remaining;
      setFullProfile(updatedProfile);
      setSyncMessage('תוכנית הוסרה ✓');
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err) {
      console.error('[AdminProgram] Failed to remove program:', err);
      setSyncMessage('שגיאה בהסרת תוכנית');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setSavingLevels(false);
    }
  };

  return {
    editingDomains,
    setEditingDomains,
    editLevels,
    setEditLevels,
    editPercents,
    setEditPercents,
    savingLevels,
    cleaningLegacy,
    showProgramPicker,
    setShowProgramPicker,
    saveManualLevelOverrides,
    assignProgramToUser,
    removeActiveProgram,
    cleanLegacyActivePrograms,
  };
}

export type UserAdminActions = ReturnType<typeof useUserAdminActions>;
