'use client';

/**
 * The machine's exercises by level, from the cached exercise catalog
 * (getExerciseCatalog: memory + IndexedDB, 30 min TTL — the same catalog the
 * library and the generator read, so normally no new read). [] while loading,
 * on failure, or when the machine has no levels / variations.
 */

import { useEffect, useState } from 'react';
import { equipmentLevelItems, type EquipmentLevelItem } from './equipment-levels';

export function useEquipmentLevels(equipmentId: string | null | undefined, locale: string, enabled: boolean): EquipmentLevelItem[] {
  const [state, setState] = useState<{ key: string; items: EquipmentLevelItem[] } | null>(null);
  const key = enabled && equipmentId ? `${equipmentId}|${locale}` : null;
  useEffect(() => {
    if (!key || !equipmentId) return;
    let alive = true;
    import('@/features/content/exercises/core/exercise-catalog')
      .then(({ getExerciseCatalog }) => getExerciseCatalog())
      .then((catalog) => { if (alive) setState({ key, items: equipmentLevelItems(catalog, equipmentId, locale) }); })
      .catch(() => { if (alive) setState({ key, items: [] }); });
    return () => { alive = false; };
  }, [key, equipmentId, locale]);
  return key && state?.key === key ? state.items : [];
}
