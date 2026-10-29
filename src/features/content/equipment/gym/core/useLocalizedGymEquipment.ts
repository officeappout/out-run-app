'use client';

import { useMemo } from 'react';
import { useContentLanguage } from '../../../shared/useContentLanguage';
import { localizeGymEquipment } from './gym-equipment-localized';

/** The station with its text in the UI content language (the same object while enable_content_locale is off). */
export function useLocalizedGymEquipment<T extends object | null | undefined>(eq: T): T {
  const lang = useContentLanguage();
  return useMemo(() => (eq ? localizeGymEquipment(eq, lang) : eq), [eq, lang]);
}
