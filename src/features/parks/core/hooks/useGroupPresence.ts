'use client';

/**
 * useGroupPresence — listens to live partner positions.
 *
 * Two modes:
 *   1. Group session: queries `presence` where uid in group memberIds
 *   2. General: consumes the full `presence` collection (filtered client-side)
 *
 * Filters out ghost users and the current user.
 */

import { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

/**
 * Persona ID → public image path.
 * Uses the same IDs from DEFAULT_PERSONAS in persona.service.ts.
 * Fallback to king-lemur for unknown persona IDs.
 */
export const PERSONA_IMAGES: Record<string, string> = {
  athlete:       '/assets/lemur/smart-lemur.png',
  parent:        '/assets/lemur/lemur-avatar.png',
  office_worker: '/assets/lemur/king-lemur.png',
  student:       '/assets/lemur/smart-lemur.png',
  senior:        '/assets/lemur/lemur-avatar.png',
  reservist:     '/assets/lemur/king-lemur.png',
  soldier:       '/assets/lemur/king-lemur.png',
  pupil:         '/assets/lemur/smart-lemur.png',
  young_pro:     '/assets/lemur/smart-lemur.png',
  pro_athlete:   '/assets/lemur/smart-lemur.png',
  vatikim:       '/assets/lemur/lemur-avatar.png',
};

export const DEFAULT_LEMUR_IMAGE = '/assets/lemur/king-lemur.png';

export function resolvePersonaImage(personaId?: string | null): string {
  if (!personaId) return DEFAULT_LEMUR_IMAGE;
  return PERSONA_IMAGES[personaId] ?? DEFAULT_LEMUR_IMAGE;
}

export interface PartnerPosition {
  uid: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  activityStatus: string;
  groupSessionId?: string;
  personaId?: string;
  personaImageUrl: string;
  lemurStage?: number;
}

// Muted, dusty palette — keeps partners identifiable without competing
// with the user's own bright cyan lemur marker.
const GROUP_COLORS = [
  '#8B9DC3', '#7BA898', '#C9A96E', '#A090B8', '#B08A9A',
  '#7EA88A', '#C49A7A', '#7E9DB0', '#B898A8', '#A4B87A',
  '#7AAEC0', '#B0AC84',
];

export function useGroupPresence(
  groupSessionId?: string | null,
  memberIds?: string[],
): PartnerPosition[] {
  const [positions, setPositions] = useState<PartnerPosition[]>([]);
  const unsubRef = useRef<Unsubscribe | null>(null);
  const colorMapRef = useRef(new Map<string, string>());

  function getColor(uid: string): string {
    if (!colorMapRef.current.has(uid)) {
      colorMapRef.current.set(uid, GROUP_COLORS[colorMapRef.current.size % GROUP_COLORS.length]);
    }
    return colorMapRef.current.get(uid)!;
  }

  useEffect(() => {
    unsubRef.current?.();
    const currentUid = auth.currentUser?.uid;

    const q = query(collection(db, 'presence'));

    unsubRef.current = onSnapshot(q, (snap) => {
      const results: PartnerPosition[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.mode === 'ghost') return;
        if (data.uid === currentUid) return;
        if (!data.activity?.status) return;

        if (groupSessionId && memberIds) {
          if (!memberIds.includes(data.uid)) return;
        }

        results.push({
          uid: data.uid,
          name: data.name ?? '',
          lat: data.lat ?? 0,
          lng: data.lng ?? 0,
          color: getColor(data.uid),
          activityStatus: data.activity?.status ?? '',
          groupSessionId: data.groupSessionId,
          personaId: data.personaId ?? undefined,
          personaImageUrl: resolvePersonaImage(data.personaId),
          lemurStage: typeof data.lemurStage === 'number' ? data.lemurStage : undefined,
        });
      });
      setPositions(results);
    }, () => {});

    return () => unsubRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupSessionId, memberIds?.join(',')]);

  return positions;
}
