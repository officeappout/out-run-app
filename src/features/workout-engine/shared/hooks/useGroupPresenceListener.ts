'use client';

import { useEffect, useRef, useState } from 'react';
import { useGroupPresence, type PartnerPosition } from '@/features/parks/core/hooks/useGroupPresence';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';

export interface MilestoneEvent {
  /** Unique per crossing: "${uid}-${km}" or "collective-${km}" */
  id: string;
  type: 'individual' | 'collective';
  name: string;
  distanceKm: number;
}

interface GroupPresenceListenerResult {
  partnerPositions: PartnerPosition[];
  totalDistanceKm: number;
  milestones: MilestoneEvent[];
}

export function useGroupPresenceListener(): GroupPresenceListenerResult {
  const { groupId, memberIds } = useSharedSession();
  const partnerPositions = useGroupPresence(groupId ?? undefined, memberIds);

  const totalDistanceKm = partnerPositions.reduce(
    (sum, p) => sum + (p.distance ?? 0),
    0,
  );

  // Last floored km seen per uid (and 'collective').
  // Updated inside useEffect — never during render.
  const lastKmRef = useRef<Record<string, number>>({});

  const [milestones, setMilestones] = useState<MilestoneEvent[]>([]);

  useEffect(() => {
    const next: MilestoneEvent[] = [];
    const prev = lastKmRef.current;

    // Individual milestones
    for (const p of partnerPositions) {
      const km = Math.floor(p.distance ?? 0);
      const prevKm = prev[p.uid] ?? 0;
      if (km > 0 && km > prevKm) {
        for (let crossed = prevKm + 1; crossed <= km; crossed++) {
          next.push({
            id: `${p.uid}-${crossed}`,
            type: 'individual',
            name: p.name,
            distanceKm: crossed,
          });
        }
        lastKmRef.current = { ...lastKmRef.current, [p.uid]: km };
      }
    }

    // Collective milestone
    const collectiveKm = Math.floor(totalDistanceKm);
    const prevCollective = prev['collective'] ?? 0;
    if (collectiveKm > 0 && collectiveKm > prevCollective) {
      for (let crossed = prevCollective + 1; crossed <= collectiveKm; crossed++) {
        next.push({
          id: `collective-${crossed}`,
          type: 'collective',
          name: '',
          distanceKm: crossed,
        });
      }
      lastKmRef.current = { ...lastKmRef.current, collective: collectiveKm };
    }

    if (next.length > 0) {
      setMilestones((prev) => [...prev, ...next]);
      console.debug('[GroupPresenceListener] milestones:', next.map((m) => m.id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerPositions, totalDistanceKm]);

  return { partnerPositions, totalDistanceKm, milestones };
}
