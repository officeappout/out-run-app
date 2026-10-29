/**
 * Explainer text reveal (owner 28.10, Y4): the health declaration's "mist clearing" word reveal,
 * so nothing lands all at once. Pure timing (tested); RevealText / RevealBlock render it.
 */

/** Same as HealthDeclarationStep: a 55ms stagger, each word 0.4s. */
export const WORD_STAGGER_S = 0.055;
export const WORD_DURATION_S = 0.4;

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** When the last word of `text`, started at `delay`, has landed. Chain the next block from here. */
export function revealEnd(text: string, delay = 0): number {
  const n = splitWords(text).length;
  if (n === 0) return delay;
  return delay + (n - 1) * WORD_STAGGER_S + WORD_DURATION_S;
}
