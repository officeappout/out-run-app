/**
 * AI tester runner — fixed limits and device profiles (B3 of agent-briefs/ai-testers-design.md).
 * Pure data. The money / session caps the OWNER sets live in demo_registry/config (read at run
 * start); the numbers here are hard ceilings the panel can only lower, never raise.
 */

export const QA_UID_PREFIX = 'demo_qa_';

/** The deployed app the native shell loads (capacitor.config.ts server.url). */
export const DEFAULT_BASE_URL = 'https://outrun.co.il';
/** Hosts the tester may load pages from (the app itself). Anything else is aborted. */
export const APP_HOSTS = ['outrun.co.il', 'www.outrun.co.il', 'appout.co.il', 'www.appout.co.il'] as const;

export const HARD_CAPS = {
  /** Steps (= model turns) per session; reaching it ends the session as gave_up (a P1 finding). */
  maxStepsPerSession: 60,
  /** Sessions per run, whatever the mission list says. */
  maxSessionsPerRun: 8,
  /** Wall-clock per session. */
  maxSessionMinutes: 20,
  /** Max real wait one `wait` tool call may ask for. */
  maxWaitSec: 60,
  /** Min pause between browser actions (load on production). */
  minActionGapMs: 300,
  /** Stop-flag poll interval. */
  stopPollMs: 10_000,
  /** Heartbeat interval (control center marks a silent runner stale after 30 min). */
  heartbeatMs: 60_000,
} as const;

/** Model for the tester loop (design §5.1: medium model to start). Override with QA_MODEL. */
export const DEFAULT_TESTER_MODEL = 'claude-sonnet-5-5';
export const MAX_TOKENS_PER_TURN = 4096;
/** Screenshots kept in the conversation (older tool results are cleared server-side). */
export const KEEP_TOOL_RESULTS = 3;

export interface DeviceProfile {
  id: string;
  engine: 'webkit' | 'chromium';
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent: string;
}

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

export const DEVICES: Record<string, DeviceProfile> = {
  'iphone-13': { id: 'iphone-13', engine: 'webkit', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IOS_UA },
  'iphone-se': { id: 'iphone-se', engine: 'webkit', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS_UA },
  'iphone-15-pro-max': { id: 'iphone-15-pro-max', engine: 'webkit', viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IOS_UA },
  'android-small': {
    id: 'android-small',
    engine: 'chromium',
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  },
};
export const DEFAULT_DEVICE = 'iphone-13';

/** Requests the tester's browser never sends (analytics would count testers as users; payments). */
export const BLOCKED_REQUEST_HOSTS = [
  'google-analytics.com',
  'www.google-analytics.com',
  'analytics.google.com',
  'www.googletagmanager.com',
  'googletagmanager.com',
  'connect.facebook.net',
  'js.stripe.com',
  'api.stripe.com',
  'checkout.stripe.com',
  'www.paypal.com',
] as const;

/** Firestore collection for findings (server-only: no client rule allows it). */
export const FINDINGS_COLLECTION = 'qa_findings';
/** Storage prefix for screenshots: qa/{runId}/{session}/{step}.png */
export const SCREENSHOT_PREFIX = 'qa';
export const STORAGE_BUCKET = 'appout-1.firebasestorage.app';
export const PROJECT_ID = 'appout-1';
