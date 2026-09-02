'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MilitaryPersonaAnswers } from '@/types/persona.types';

export interface ResolvedMilitaryDeclaration {
  loading: boolean;
  /** The raw, unmodified military_declarations/{uid} content (ids only). */
  raw: MilitaryPersonaAnswers | null;
  /** Current live names, resolved from unitDirectory at render time. */
  orgName: string | null;
  unitName: string | null;
  /**
   * false when a declared orgId/unitId no longer resolves in unitDirectory
   * (the org/unit was deleted or restructured after the user declared it).
   * Consumers must show "the unit no longer exists — update?" on false,
   * never a silently-blank name.
   */
  resolved: boolean;
}

/**
 * military_declarations/{uid} stores only orgId/unitId/unitPathIds — IDs,
 * never names (deliberate, see firestore.rules' military_declarations
 * comment). Any UI showing a saved declaration back to the user (re-editing
 * in the drawer, a future Phase 5 profile screen) must resolve the current
 * name from unitDirectory live, not cache a name at write time — an org can
 * be deleted or restructured after the user declared it.
 */
export function useResolvedMilitaryDeclaration(uid: string | undefined): ResolvedMilitaryDeclaration {
  const [state, setState] = useState<ResolvedMilitaryDeclaration>({
    loading: true,
    raw: null,
    orgName: null,
    unitName: null,
    resolved: false,
  });

  useEffect(() => {
    if (!uid) {
      setState({ loading: false, raw: null, orgName: null, unitName: null, resolved: false });
      return;
    }

    let cancelled = false;
    (async () => {
      const declSnap = await getDoc(doc(db, 'military_declarations', uid));
      if (cancelled) return;

      if (!declSnap.exists()) {
        setState({ loading: false, raw: null, orgName: null, unitName: null, resolved: false });
        return;
      }

      const raw = declSnap.data() as MilitaryPersonaAnswers;
      const orgId = raw.orgId;
      const unitId = raw.unitId;

      const [orgDirSnap, unitDirSnap] = await Promise.all([
        orgId ? getDoc(doc(db, 'unitDirectory', orgId)) : Promise.resolve(null),
        orgId && unitId ? getDoc(doc(db, 'unitDirectory', `${orgId}__${unitId}`)) : Promise.resolve(null),
      ]);
      if (cancelled) return;

      const orgExists = !orgId || (orgDirSnap?.exists() ?? false);
      const unitExists = !unitId || (unitDirSnap?.exists() ?? false);

      setState({
        loading: false,
        raw,
        orgName: orgDirSnap?.exists() ? (orgDirSnap.data().name as string) : null,
        unitName: unitDirSnap?.exists() ? (unitDirSnap.data().name as string) : null,
        // Declared nothing (orgId/unitId both absent) still counts as "resolved" —
        // there's nothing stale to flag, just an empty declaration.
        resolved: orgExists && unitExists,
      });
    })();

    return () => { cancelled = true; };
  }, [uid]);

  return state;
}
