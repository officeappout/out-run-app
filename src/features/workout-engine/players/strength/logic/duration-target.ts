/**
 * duration-target — seconds of a time exercise's `duration` label (pure).
 *
 * Labels come as "45 שניות" or, from hybrid stations (strength-block-to-plan
 * prescriptionLabel), with a sets prefix: "3×45 שניות". The prefix must not be
 * read as the target (pilot M20: the list showed "1 second", a hold timer 3 s).
 */
export function parseDurationSeconds(label: string | null | undefined, fallback = 30): number {
  if (!label) return fallback;
  const match = label.replace(/^\s*\d+\s*[xX×]\s*/, '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : fallback;
}
