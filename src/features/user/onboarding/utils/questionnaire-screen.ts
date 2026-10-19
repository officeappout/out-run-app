/**
 * Dynamic questionnaire (/onboarding-new/dynamic) — pure render decisions,
 * kept out of the page so the anti-flicker rules are unit-tested.
 */

/**
 * What the page shows. The question is held on the loading screen until the
 * engine has its first question AND the feature flags are known — otherwise
 * a first visit paints the legacy question and swaps to v2 when the flags
 * snapshot lands (a full-screen flash).
 */
export function questionnaireScreen(input: {
  engineLoading: boolean;
  flagsReady: boolean;
  error: string | null;
}): 'loading' | 'error' | 'question' {
  if (input.engineLoading || !input.flagsReady) return 'loading';
  if (input.error) return 'error';
  return 'question';
}

/**
 * className of the per-question framer-motion wrapper.
 *
 * Legacy: unchanged — a CSS `transition-all` plus an opacity/scale class
 * toggled while an answer is processed.
 *
 * v2: NO CSS transition and no opacity/scale classes. framer-motion already
 * animates opacity + x on this element (enter/exit); a CSS `transition-all`
 * on the same element re-transitions every inline style framer writes per
 * frame (the element lags and jumps — visible flicker on each question
 * change), and the toggled `opacity-0 scale-95` fights framer's inline
 * opacity/transform.
 */
export function questionMotionClass(v2: boolean, isAnimating: boolean): string {
  if (v2) return 'w-full font-simpler flex min-h-full flex-col';
  return `w-full font-simpler ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'} transition-all duration-300`;
}
