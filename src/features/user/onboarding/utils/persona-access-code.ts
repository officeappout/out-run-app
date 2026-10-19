/**
 * Which persona picks open the organization access-code popup
 * ("יש לך קוד גישה מהארגון?").
 *
 * office_worker is the one vertical whose chain produces a league tab today
 * (the CF writes a 'company' affiliation). Until 19.10.2026 it opened for
 * EVERY user who tapped "עובד משרד" — a B2B prompt shown to B2C users. It is
 * now behind the runtime flag `enable_org_access_code_prompt` (default off,
 * admin toggle in /admin/system-settings) so B2B can turn it back on.
 * military / pupil / student keep their own compile-time flags (all false).
 */

export interface AccessCodePersonaFlags {
  /** enable_org_access_code_prompt (runtime, admin panel). */
  officeWorker: boolean;
  /** ACCESS_CODE_MILITARY_ENABLED / _SCHOOL_ / _UNIVERSITY_ (compile-time). */
  military: boolean;
  school: boolean;
  university: boolean;
}

export function resolveAccessCodePersonaIds(flags: AccessCodePersonaFlags): ReadonlySet<string> {
  return new Set([
    ...(flags.officeWorker ? ['office_worker'] : []),
    ...(flags.military ? ['military'] : []),
    ...(flags.school ? ['pupil'] : []),
    ...(flags.university ? ['student'] : []),
  ]);
}
