/**
 * Run-invite decisions (enable_group_fixes_v1), pure + unit-tested.
 *
 *  - shouldReInvite: a "now" invite reuses the caller's session only while the
 *    run IS a group run (isGroupRun) or it comes from the session lobby. Before,
 *    any stale useSharedSession.groupId (CommunitySessionBanner sets it for a
 *    member's solo run near a session) turned a fresh invite into a re-invite
 *    of somebody else's session.
 *  - localNowStamp / parseClientNow: a "now" invite carries the client's local
 *    'YYYY-MM-DDTHH:mm'; the server (UTC) used its own clock for the
 *    attendanceId / time shown to the invitee — 2–3 hours off in Israel.
 */

export function shouldReInvite(input: {
  scheduled: boolean;
  groupId?: string | null;
  attendanceId?: string | null;
  groupFixes: boolean;
  isGroupRun: boolean;
  fromLobby?: boolean;
}): boolean {
  if (input.scheduled || !input.groupId || !input.attendanceId) return false;
  if (!input.groupFixes) return true; // legacy: any live session context
  return input.isGroupRun || input.fromLobby === true;
}

const pad = (n: number) => n.toString().padStart(2, '0');

/** The device's local wall-clock time as 'YYYY-MM-DDTHH:mm'. */
export function localNowStamp(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

const STAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
/** Any real timezone is within ±14 h of UTC; allow a little clock skew. */
const MAX_OFFSET_MS = 15 * 60 * 60 * 1000;

/**
 * Server side: the client's stamp → attendanceId 'YYYY-MM-DD_HH-mm', or null
 * when it is missing / malformed / not plausibly "now" in some timezone.
 */
export function attendanceIdFromClientNow(stamp: unknown, serverNowMs: number): string | null {
  if (typeof stamp !== 'string') return null;
  const m = STAMP_RE.exec(stamp);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  if (Math.abs(asUtc - serverNowMs) > MAX_OFFSET_MS) return null;
  return `${m[1]}-${m[2]}-${m[3]}_${m[4]}-${m[5]}`;
}
