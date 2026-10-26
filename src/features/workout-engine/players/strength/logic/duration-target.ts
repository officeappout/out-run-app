/**
 * Pilot S4: a hold's display string carries a set prefix ("3×20-45 שניות"), so reading
 * the FIRST number took the set count (3) as the hold target in seconds. Strip the
 * prefix first, the same way the reps string is already parsed.
 * Returns null when the string has no number.
 */
export function parseDurationSeconds(durationStr: string | undefined | null): number | null {
  if (!durationStr) return null;
  const stripped = durationStr.replace(/^\s*\d+\s*[xX×]\s*/, '');
  const match = stripped.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
