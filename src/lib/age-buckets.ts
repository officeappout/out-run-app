/**
 * Age bucketing — shared between every Journey Hub Wave 2 segmentation
 * filter (growth-metrics/route.ts, funnel-analytics.service.ts) so the
 * bucket definitions can't drift between a server-side (Admin SDK,
 * in-memory predicate) and a client-side (Firestore `where()` range on
 * `core.birthDate`) consumer. Pulled out specifically because it's pure
 * logic with no Firebase dependency — safe to import from both a server
 * route and a client service.
 */

/** Age buckets, in whole years. 'u18'/'55p' are open-ended on their outer edge. */
export const AGE_BUCKETS = ['u18', '18-24', '25-34', '35-44', '45-54', '55p'] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export function isAgeBucket(v: string | null | undefined): v is AgeBucket {
  return !!v && (AGE_BUCKETS as readonly string[]).includes(v);
}

/**
 * [minAgeInclusive, maxAgeInclusive] in years for a bucket, or null for
 * the open-ended edges (u18 -> no lower bound; 55p -> no upper bound).
 */
export function ageBucketToYearRange(bucket: AgeBucket): [number | null, number | null] {
  switch (bucket) {
    case 'u18': return [null, 17];
    case '18-24': return [18, 24];
    case '25-34': return [25, 34];
    case '35-44': return [35, 44];
    case '45-54': return [45, 54];
    case '55p': return [55, null];
  }
}

export function getAgeInYears(birthDate: Date, asOf: Date): number {
  let age = asOf.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    asOf.getMonth() > birthDate.getMonth() ||
    (asOf.getMonth() === birthDate.getMonth() && asOf.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age;
}

/**
 * [minBirthDate, maxBirthDate] (inclusive) for a bucket, computed
 * relative to `asOf` — the mirror image of `ageBucketToYearRange`, for
 * callers that need a Firestore range constraint on `core.birthDate`
 * instead of an in-memory age check. A larger age -> an EARLIER
 * birthDate, so the min/max flip relative to the year range.
 */
export function ageBucketToBirthDateRange(bucket: AgeBucket, asOf: Date): [Date | null, Date | null] {
  const [minAge, maxAge] = ageBucketToYearRange(bucket);
  // maxAge (older bound) -> earliest birthDate (minBirthDate)
  const minBirthDate = maxAge == null ? null : bornOnOrAfterNYearsAgo(maxAge + 1, asOf, /* dayAfter */ true);
  // minAge (younger bound) -> latest birthDate (maxBirthDate)
  const maxBirthDate = minAge == null ? null : bornOnOrAfterNYearsAgo(minAge, asOf, /* dayAfter */ false);
  return [minBirthDate, maxBirthDate];
}

/**
 * The birthDate of someone turning exactly `years` old today (`asOf`).
 * `dayAfter` shifts one day later — used for the lower bound (exclusive
 * "older than maxAge+1" becomes inclusive ">= the day after turning
 * maxAge+1 years ago").
 */
function bornOnOrAfterNYearsAgo(years: number, asOf: Date, dayAfter: boolean): Date {
  const d = new Date(asOf);
  d.setFullYear(d.getFullYear() - years);
  if (dayAfter) d.setDate(d.getDate() + 1);
  return d;
}
