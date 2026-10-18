/**
 * isWeatherOnFor — who gets weather (the home chip + weather-aware workouts).
 *
 *   weather_enabled OFF                          → nobody
 *   weather_enabled ON  + weather_admins_only ON → super admins only (testing mode)
 *   weather_enabled ON  + weather_admins_only OFF → everyone
 *
 * Takes the LIVE flag values (useFeatureFlags' rawFlags), never the super-admin override —
 * otherwise a super admin would get the static superAdminValue and the panel toggle
 * would not affect him. Pure, no imports: unit-tested in weather-access.test.ts.
 */
export function isWeatherOnFor(
  flags: { weatherEnabled: boolean; weatherAdminsOnly: boolean },
  isSuperAdmin: boolean | undefined,
): boolean {
  if (!flags.weatherEnabled) return false;
  if (flags.weatherAdminsOnly) return !!isSuperAdmin;
  return true;
}
