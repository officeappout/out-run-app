/** Tunables for the together layer — one place, no magic numbers in components. */
export const TOGETHER_CONFIG = {
  /** Never write presence more often than this (brief: ≤1 per 3-5 s). */
  minWriteGapMs: 4000,
  /** Write at least this often while active so `lastSeen` stays fresh. */
  heartbeatMs: 20_000,
  /** Older than this = "last seen …" instead of live. */
  staleAfterMs: 45_000,
  /** Strength: levels at most this far apart still train the same workout. */
  maxLevelSpread: 1,
  /** Run: the slowest pace may be at most this many times the fastest. */
  maxPaceRatio: 1.2,
  /** The lobby opens this long before the session. */
  lobbyOpensMinBefore: 10,
  /** Reminder offered to people who joined for later. */
  reminderMinBefore: 15,
  /** 3-2-1 length and the lead time we give every device to hear about it. */
  countdownSeconds: 3,
  countdownLeadMs: 1500,
  /** Cheer burst length. */
  cheerBurstMs: 900,
} as const;

export type TogetherConfig = typeof TOGETHER_CONFIG;
