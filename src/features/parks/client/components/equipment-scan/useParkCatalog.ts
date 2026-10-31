'use client';

/**
 * The park-installed gym_equipment catalog, localized, for the scan screens (same filter as the
 * add-park StepEquipment). Reads the shared in-memory cache; [] while loading or on failure.
 */
import { useEffect, useState } from 'react';
import { getAllGymEquipmentCached } from '@/features/content/equipment/gym/core/gym-equipment.service';
import { localizeGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment-localized';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import type { AppLanguage } from '@/features/content/shared/localized-text.types';

export function useParkCatalog(lang: string, enabled = true): { catalog: GymEquipment[]; loading: boolean } {
  const [state, setState] = useState<{ lang: string; catalog: GymEquipment[] } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    getAllGymEquipmentCached()
      .then((all) => {
        if (!alive) return;
        const park = all.filter((e) => !e.availableInLocations?.length || e.availableInLocations.includes('park'));
        setState({ lang, catalog: park.map((e) => localizeGymEquipment(e, lang as AppLanguage)) });
      })
      .catch(() => { if (alive) setState({ lang, catalog: [] }); });
    return () => { alive = false; };
  }, [lang, enabled]);
  return { catalog: state?.lang === lang ? state.catalog : [], loading: state?.lang !== lang };
}
