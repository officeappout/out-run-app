/**
 * Age range filtering — shared between every Journey Hub segmentation
 * filter (growth-metrics/route.ts, funnel-analytics.service.ts) so the
 * same min/max-age math can't drift between a server-side (Admin SDK,
 * in-memory predicate) and a client-side (Firestore `where()` range on
 * `core.birthDate`) consumer. Pulled out specifically because it's pure
 * logic with no Firebase dependency — safe to import from both a server
 * route and a client service.
 *
 * The admin defines the range directly (two free-form number inputs in
 * JourneyFilterBar) — there is no fixed bucket list here. A prior
 * version of this file hardcoded 6 buckets (u18/18-24/25-34/35-44/
 * 45-54/55p); removed per David's explicit "make it DYNAMIC" instruction
 * (06.10.2026) — a free min/max range is strictly more expressive and
 * needs no bucket-boundary config to maintain.
 */

export function getAgeInYears(birthDate: Date, asOf: Date): number {
  let age = asOf.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    asOf.getMonth() > birthDate.getMonth() ||
    (asOf.getMonth() === birthDate.getMonth() && asOf.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age;
}

/**
 * [minBirthDate, maxBirthDate] (inclusive), computed relative to `asOf`,
 * for callers that need a Firestore range constraint on `core.birthDate`
 * instead of an in-memory age check. A larger age -> an EARLIER
 * birthDate, so the min/max flip relative to the age range: the OLDER
 * bound (`maxAge`) produces the EARLIEST birthDate (`minBirthDate`), and
 * the YOUNGER bound (`minAge`) produces the LATEST birthDate
 * (`maxBirthDate`).
 */
export function ageRangeToBirthDateRange(
  minAge: number | null,
  maxAge: number | null,
  asOf: Date,
): [Date | null, Date | null] {
  const minBirthDate = maxAge == null ? null : bornOnOrAfterNYearsAgo(maxAge + 1, asOf, /* dayAfter */ true);
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
