'use client';

/**
 * The tapped park's full record (gymEquipment / city / rating — the catalog row has none) via the
 * shared once-per-session point-fetch. `loading` until it lands; a failed read → park null, not loading.
 */

import { useEffect, useState } from 'react';
import type { Park } from '@/features/parks/core/types/park.types';
import { getParkOnce } from '@/features/parks/core/services/park-point-fetch';

export function useFullPark(parkId: string | null): { park: Park | null; loading: boolean } {
  const [state, setState] = useState<{ id: string; park: Park | null } | null>(null);
  useEffect(() => {
    if (!parkId) return;
    let alive = true;
    getParkOnce(parkId).then((park) => { if (alive) setState({ id: parkId, park }); });
    return () => { alive = false; };
  }, [parkId]);
  const done = !!parkId && state?.id === parkId;
  return { park: done ? state?.park ?? null : null, loading: !!parkId && !done };
}
