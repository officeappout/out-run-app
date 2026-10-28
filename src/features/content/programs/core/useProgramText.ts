'use client';

import { useCallback } from 'react';
import { useContentLanguage } from '../../shared/useContentLanguage';
import { pickProgramText } from './localized-fields';

/** `t(program, 'name')` -> the program / level / level-settings text in the UI content language (Hebrew while enable_content_locale is off). */
export function useProgramText() {
  const lang = useContentLanguage();
  return useCallback(
    (item: Parameters<typeof pickProgramText>[0], key: Parameters<typeof pickProgramText>[1]) => pickProgramText(item, key, lang),
    [lang],
  );
}
