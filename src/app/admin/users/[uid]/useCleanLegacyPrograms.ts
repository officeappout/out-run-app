'use client';

import { useState } from 'react';
import type { UserFullProfile } from '@/types/user-profile';
import { getAllPrograms, MASTER_PROGRAM_ID_TO_SLUG } from '@/features/content/programs';

/** "נקה Legacy" admin action, moved verbatim out of page.tsx (I1 refactor). */
export function useCleanLegacyPrograms({
  fullProfile,
  setFullProfile,
  setSyncMessage,
}: {
  fullProfile: UserFullProfile | null;
  setFullProfile: (p: UserFullProfile | null) => void;
  setSyncMessage: (m: string | null) => void;
}) {
  const [cleaningLegacy, setCleaningLegacy] = useState(false);

  // ── Clean legacy English / broken activePrograms entries ───────────────
  // Removes entries that match ANY of these conditions:
  //   1. name contains ASCII letters → English humanized name stored by old onboarding
  //      (e.g. "full body", "Full Body", "calisthenics upper")
  //   2. id or templateId is exactly 'calisthenics' — broken slug missing '_upper'
  //   3. id is a raw 20-char Firestore auto-ID hash AND a proper slug entry
  //      for the same base program already exists elsewhere in the array
  // After filtering, deduplicates by normalized templateId (keep first occurrence).
  const cleanLegacyActivePrograms = async () => {
    // Use fullProfile.id — the ID of the user currently open in the modal.
    // Do NOT use user.id here; that refers to the AdminUserListItem prop which
    // in some auth contexts resolves to the logged-in admin's own UID.
    if (!fullProfile?.id) return;
    const targetUserId = fullProfile.id;
    setCleaningLegacy(true);
    try {
      const { doc, getDoc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      // Always read fresh from Firestore — never trust in-memory state.
      const snap = await getDoc(doc(db, 'users', targetUserId));
      if (!snap.exists()) {
        setSyncMessage('משתמש לא נמצא ב-Firestore');
        setTimeout(() => setSyncMessage(null), 3000);
        return;
      }
      const raw = snap.data();

      console.log('[AdminClean] progression keys:', Object.keys(raw?.progression ?? {}));

      // ── Build hash → slug map from live Firestore programs ───────────────
      // Seed with the static map for the 4 known master programs, then fill
      // the rest from all programs in Firestore so movement-pattern programs
      // (push/pull/legs/core) are covered as well.
      const allPrograms = await getAllPrograms();
      const idToSlug: Record<string, string> = { ...MASTER_PROGRAM_ID_TO_SLUG };
      for (const p of allPrograms) {
        if (!idToSlug[p.id]) {
          idToSlug[p.id] =
            (p as any).slug ??
            (p as any).movementPattern ??
            p.name.toLowerCase().replace(/[\s-]+/g, '_');
        }
      }

      // ── Determine if a map key is legacy / broken ────────────────────────
      // Valid keys are lowercase ASCII slugs with underscores (push, full_body).
      // Legacy keys have spaces ("full body"), capital letters ("Full Body"),
      // or are the broken "calisthenics" slug that was never resolved.
      const isLegacyKey = (key: string): boolean => {
        if (key === 'calisthenics') return true;       // broken slug (missing _upper)
        if (key.includes(' ')) return true;            // space → humanized English name
        if (/[A-Z]/.test(key)) return true;            // uppercase → legacy camelCase/Title
        return false;
      };

      // Returns true when a key looks like a Firestore auto-generated hash ID
      // (long alphanumeric string with no underscores or spaces).
      const isFirestoreHash = (key: string): boolean =>
        key.length > 15 && /^[a-zA-Z0-9]+$/.test(key);

      // ── Clean progression.domains ────────────────────────────────────────
      const rawDomains = raw?.progression?.domains ?? {};
      const cleanedDomains: Record<string, any> = {};
      const removedDomainKeys: string[] = [];
      for (const [k, v] of Object.entries(rawDomains)) {
        const correspondingSlug = idToSlug[k];
        const slugAlreadyInDomains = !!correspondingSlug && correspondingSlug in rawDomains;
        if (isLegacyKey(k) || (isFirestoreHash(k) && slugAlreadyInDomains)) {
          removedDomainKeys.push(k);
        } else {
          cleanedDomains[k] = v;
        }
      }

      // ── Clean progression.tracks ─────────────────────────────────────────
      const rawTracks = raw?.progression?.tracks ?? {};
      const cleanedTracks: Record<string, any> = {};
      const removedTrackKeys: string[] = [];
      for (const [k, v] of Object.entries(rawTracks)) {
        const correspondingSlug = idToSlug[k];
        const slugAlreadyInTracks = !!correspondingSlug && correspondingSlug in rawTracks;
        if (isLegacyKey(k) || (isFirestoreHash(k) && slugAlreadyInTracks)) {
          removedTrackKeys.push(k);
        } else {
          cleanedTracks[k] = v;
        }
      }

      // ── Clean progression.activePrograms (array) ─────────────────────────
      const existing: any[] = raw?.progression?.activePrograms ?? [];
      const firestoreHashRe = /^[a-zA-Z0-9]{20}$/;
      const hasEnglishLetterRe = /[a-zA-Z]/;
      const slugIds = new Set(
        existing
          .map((ap: any) => (ap.id || ap.templateId || '') as string)
          .filter((id) => !firestoreHashRe.test(id) && id.trim() !== ''),
      );
      const isLegacyEntry = (ap: any): boolean => {
        const id = (ap.id || '') as string;
        const templateId = (ap.templateId || '') as string;
        const name = (ap.name || '') as string;
        if (hasEnglishLetterRe.test(name)) return true;
        if (id === 'calisthenics' || templateId === 'calisthenics') return true;
        if (firestoreHashRe.test(id) && slugIds.size > 0) return true;
        return false;
      };
      const filtered = existing.filter((ap: any) => !isLegacyEntry(ap));
      const seen = new Set<string>();
      const cleanedActivePrograms = filtered.filter((ap: any) => {
        const key = (ap.templateId || ap.id || '').toLowerCase().trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const removedActivePrograms = existing.length - cleanedActivePrograms.length;

      const totalRemoved = removedDomainKeys.length + removedTrackKeys.length + removedActivePrograms;

      console.log('[AdminClean] Removed domain keys:', removedDomainKeys);
      console.log('[AdminClean] Removed track keys:', removedTrackKeys);
      console.log('[AdminClean] Removed activePrograms entries:', removedActivePrograms);
      console.log('[AdminClean] Clean domains:', Object.keys(cleanedDomains));
      console.log('[AdminClean] Clean tracks:', Object.keys(cleanedTracks));

      if (totalRemoved === 0) {
        setSyncMessage('לא נמצאו רשומות ישנות — הכל נקי ✓');
        setTimeout(() => setSyncMessage(null), 4000);
        return;
      }

      // Write all three cleaned objects back in one atomic updateDoc call
      await updateDoc(doc(db, 'users', targetUserId), {
        'progression.domains': cleanedDomains,
        'progression.tracks': cleanedTracks,
        'progression.activePrograms': cleanedActivePrograms,
      });

      // Refresh local state so the UI reflects the cleaned data immediately
      const refreshed = await getDoc(doc(db, 'users', targetUserId));
      if (refreshed.exists()) {
        setFullProfile({ id: targetUserId, ...refreshed.data() } as any);
      }

      setSyncMessage(`ניקוי הושלם: ${totalRemoved} שדות ישנים הוסרו ✓`);
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err) {
      console.error('[AdminClean] Failed to clean legacy programs:', err);
      setSyncMessage('שגיאה בניקוי');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setCleaningLegacy(false);
    }
  };

  return { cleaningLegacy, cleanLegacyActivePrograms };
}
