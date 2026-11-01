'use client';

import { useEffect, useState } from 'react';
import { getCachedPrograms } from '@/features/workout-engine/services/program-hierarchy.utils';
import { englishProgramName } from '@/features/content/programs/core/localized-fields';
import { useContentLanguage } from '@/features/content/shared/useContentLanguage';
import { programLabelEn } from '@/lib/i18n/static-labels';

/**
 * Hardcoded slug → Hebrew label map.  Lives here (not in the cached
 * programs document) because some legacy programs ship without a
 * `name` field and we still need a stable Hebrew label for the
 * tag chips in the detail drawer.
 */
const SLUG_TO_HE: Record<string, string> = {
  full_body: 'כל הגוף',
  fullbody: 'כל הגוף',
  upper_body: 'פלג גוף עליון',
  push: 'דחיפה',
  pushing: 'דחיפה',
  lower_body: 'רגליים',
  legs: 'רגליים',
  pull: 'משיכה',
  pulling: 'משיכה',
  calisthenics: 'קליסטניקס',
  running: 'ריצה',
  cardio: 'קרדיו',
  core: 'ליבה',
  pilates: 'פילאטיס',
  yoga: 'יוגה',
  healthy_lifestyle: 'אורח חיים בריא',
  pull_up_pro: 'מתח מקצועי',
  planche: 'פלאנש',
  handstand: 'עמידת ידיים',
  muscle_up: 'מאסל אפ',
  front_lever: 'פרונט לבר',
  back_lever: 'בק לבר',
};

interface UseProgramMapReturn {
  /** `programId → Hebrew display name`.  Empty until the cached fetch resolves. */
  programMap: Record<string, string>;
}

/**
 * Loads the cached program hierarchy once on mount and folds every entry's
 * id → name into a flat lookup table, layered on top of the static
 * `SLUG_TO_HE` map (so legacy slugs without a `name` field still resolve).
 *
 * Consumed by `<ExerciseDetailDrawer />` to render the target-program
 * tag chips in Hebrew.
 */
export function useProgramMap(): UseProgramMapReturn {
  const [programMap, setProgramMap] = useState<Record<string, string>>({});
  const contentLang = useContentLanguage();

  useEffect(() => {
    let cancelled = false;
    getCachedPrograms().then((programs) => {
      if (cancelled) return;
      // English mode: catalog labels for the static slugs (Hebrew: SLUG_TO_HE as before).
      const map: Record<string, string> = Object.fromEntries(
        Object.entries(SLUG_TO_HE).map(([slug, he]) => [slug, programLabelEn(slug, contentLang) ?? he]),
      );
      for (const p of programs) {
        map[p.id] = englishProgramName(p, contentLang) || programLabelEn(p.id, contentLang) || SLUG_TO_HE[p.id] || p.name;
      }
      setProgramMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [contentLang]);

  return { programMap };
}
