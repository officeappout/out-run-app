'use client';

import { useMemo } from 'react';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { useContentLanguage } from '@/features/content/shared/useContentLanguage';
import { buildEngineTitleIndex, displayWorkoutTitle, type TitleKeyLookup, type WorkoutTitleParts } from '@/features/workout-engine/logic/engine-title-display';

/**
 * A workout title for display: the content-row pair (content language) or the catalog text of an engine-generated title (UI language).
 * Hebrew UI, or a title without parts: `heTitle` exactly as passed (byte-identical). Nothing here is ever saved.
 */
export function useDisplayWorkoutTitle(heTitle: string, parts?: WorkoutTitleParts): string {
  const t = useT(home);
  const contentLang = useContentLanguage();
  const uiLang = t.locale;
  const tr = useMemo<TitleKeyLookup>(() => (key, values) => (t as unknown as (k: string, v?: Record<string, string>) => string)(key, values), [t]);
  const index = useMemo(() => (uiLang === 'en' ? buildEngineTitleIndex(tr) : undefined), [uiLang, tr]);
  return useMemo(() => {
    if (!parts || (uiLang === 'he' && contentLang === 'he')) return heTitle;
    return displayWorkoutTitle(parts, { contentLang, uiLang, tr, index, heWithFocus: heTitle });
  }, [heTitle, parts, uiLang, contentLang, tr, index]);
}
