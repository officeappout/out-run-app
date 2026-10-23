/** Tunables and names for TV mode (enable_tv_mode_v1) — one place, no magic numbers in components. */
export const TV_COLLECTION = 'tvSessions';
export const TV_PARTICIPANTS = 'participants';

export const TV_CODE_LENGTH = 6;
/** The code (and so the whole session) lives this long. */
export const TV_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
/** The host phone stamps `hostBeatAt` this often while a session is open. */
export const TV_HEARTBEAT_MS = 5000;
/** No heartbeat for this long = the phone is gone (TV shows the reconnect state). */
export const TV_LOST_AFTER_MS = 20_000;
/** Participants refresh their presence at most this often. */
export const TV_PRESENCE_MIN_GAP_MS = 3000;
/** The runner's mirror is written at most this often (first change at once, the rest coalesced). */
export const TV_MIRROR_MIN_GAP_MS = 250;
/** Server-clock offset samples kept (the lowest-latency one wins). */
export const TV_CLOCK_SAMPLES = 12;
/** The TV draws at most this many people (the rest are counted, not drawn). */
export const TV_MAX_PARTICIPANTS = 12;

/** Guest nickname: 1..20 characters (code points). */
export const TV_NICKNAME_MAX = 20;
/** Default avatars (a colour each) — a person gets one from their uid, no picker. */
export const TV_AVATAR_COUNT = 8;

/** The short public path of the TV page and its join link. */
export const TV_PATH = '/tv';
export const TV_CODE_PARAM = 'code';
