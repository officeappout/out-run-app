'use client';

import type { ComponentType } from 'react';
import { useStrengthQuizV3Entry } from './useStrengthQuizV3';
import StrengthQuizV3Intro from './StrengthQuizV3Intro';

/** Flag off (or not known yet): the legacy screen, untouched. Flag on: the v3 intro screens. */
export default function StrengthQuizV3Gate({ legacy: Legacy }: { legacy: ComponentType }) {
  const v3 = useStrengthQuizV3Entry();
  return v3 ? <StrengthQuizV3Intro /> : <Legacy />;
}
