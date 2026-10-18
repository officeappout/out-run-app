/**
 * Kelly's system identity — no imports, so scripts and server code can use it without pulling
 * in the client Firebase SDK (kelly-welcome-bot.service.ts re-exports these).
 */

/** Kelly's permanent system UID — never collides with a real Firebase Auth uid. */
export const KELLY_UID = 'system_kelly_coach';

/** Display name shown on every Kelly message and in the inbox thread header. */
export const KELLY_NAME = 'קלי (OutRun Coach)';
