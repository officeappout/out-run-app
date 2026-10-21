/**
 * The Android back button, simulated in the tester's browser (owner, 21.10.2026 — rule OWN-007:
 * close an open sheet first, then the previous step, never a blank page, never leave the app in
 * the middle of a flow).
 *
 * How the runner presses it (driver.backButton):
 *   1. a sheet / dialog is open → Escape; if it is still open → history.back();
 *   2. nothing open → history.back(), but only when the previous history entry is an app page
 *      (Navigation API, Chromium). At the first app screen (the entry before it is /qa/signin or
 *      nothing) a real Android app would exit — the runner does NOT navigate and judges that
 *      instead (fine on /home and /gateway, wrong in the middle of a flow).
 *
 * LIMITS (documented in README): this is a browser, not the Capacitor shell. The app's native
 * handler (src/lib/native/init.ts App.backButton → BackStack.dispatch → history.back) does not
 * run, so a sheet that only closes through BackStack, or an in-memory wizard step that only
 * goes back through BackStack, shows up here as "sheet_stayed" / "no_change" — reported with low
 * confidence. Workout screens (/active, /workout-builder) block back natively by design.
 *
 * Pure: the in-page snapshot script (a string, like lint/collect.ts) + the classifier.
 */

export interface BackSnapshot {
  url: string;
  host: string;
  path: string;
  /** Visible open sheets / dialogs. */
  dialogs: number;
  /** Visible text length of the page (blank-page check). */
  textLen: number;
  /** The first visible text (a cheap "did the content change" signature). */
  sig: string;
  /** Pathname of the previous history entry, null when unknown / none. */
  prevPath: string | null;
  /** navigation.canGoBack (null = Navigation API unavailable). */
  canGoBack: boolean | null;
}

export const BACK_SNAPSHOT_JS = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const set = new Set();
  document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-vaul-drawer]').forEach((el) => { if (el.getAttribute('aria-hidden') !== 'true' && vis(el)) set.add(el); });
  const roots = Array.from(set).filter((el) => !Array.from(set).some((o) => o !== el && o.contains(el)));
  const text = (document.body && document.body.innerText || '').replace(/\\s+/g, ' ').trim();
  let prevPath = null, canGoBack = null;
  try {
    const nav = window.navigation;
    if (nav && nav.currentEntry) {
      canGoBack = !!nav.canGoBack;
      const entries = nav.entries();
      const prev = entries[nav.currentEntry.index - 1];
      if (prev && prev.url) prevPath = new URL(prev.url).pathname;
    }
  } catch (e) {}
  return { url: location.href, host: location.host, path: location.pathname, dialogs: roots.length, textLen: text.length, sig: text.slice(0, 160), prevPath, canGoBack };
})()`;

/** Paths where leaving the app (or landing on nothing) breaks a flow in the middle. */
const MID_FLOW_PREFIXES = ['/onboarding', '/onboarding-new', '/workout-builder', '/active-workout-ui', '/session', '/run'];
/** Native back exits the app on these (src/lib/native/init.ts) — the expected behaviour. */
export const ROOT_PATHS = ['/home', '/gateway'];

export function isMidFlowPath(path: string): boolean {
  return MID_FLOW_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) || /\/active(\/|$)/.test(path);
}

/** Whether there is an app page to go back to (else a real Android app would exit). */
export function hasAppHistory(s: Pick<BackSnapshot, 'prevPath' | 'canGoBack'>): boolean {
  if (s.canGoBack === false) return false;
  if (s.prevPath === null) return s.canGoBack === true;
  return s.prevPath !== '/qa/signin' && !s.prevPath.startsWith('/qa/');
}

export type BackPlan = 'escape' | 'history' | 'none';

export function planBack(before: BackSnapshot): BackPlan {
  if (before.dialogs > 0) return 'escape';
  return hasAppHistory(before) ? 'history' : 'none';
}

export type BackKind =
  | 'sheet_closed'
  | 'sheet_stayed'
  | 'went_back'
  | 'step_back'
  | 'no_change'
  | 'blank_page'
  | 'left_app'
  | 'exit_at_root'
  | 'would_exit_app';

export interface BackOutcome {
  kind: BackKind;
  ok: boolean;
  /** For a wrong outcome: how bad. */
  severity: 'P1' | 'P2' | 'P3' | null;
  /** How sure the runner is (low where the browser can't see the native handler). */
  confidence: number;
  midFlow: boolean;
  from: string;
  to: string;
  /** Hebrew, for the finding / the model. */
  he: string;
}

const BLANK_TEXT_LEN = 15;

/** Judges one back press. `after` is null when the runner did not navigate (plan "none"). */
export function classifyBack(before: BackSnapshot, after: BackSnapshot | null, appHosts: readonly string[]): BackOutcome {
  const midFlow = isMidFlowPath(before.path);
  const base = { midFlow, from: before.path, to: after?.path ?? before.path };
  const out = (kind: BackKind, ok: boolean, severity: BackOutcome['severity'], confidence: number, he: string): BackOutcome => ({ kind, ok, severity, confidence, he, ...base });

  if (!after) {
    if (ROOT_PATHS.includes(before.path)) return out('exit_at_root', true, null, 1, 'במסך ראשי — חזרה יוצאת מהאפליקציה, כמצופה.');
    return midFlow
      ? out('would_exit_app', false, 'P1', 0.8, `באמצע תהליך (${before.path}) אין לאן לחזור — באנדרואיד החזרה הייתה יוצאת מהאפליקציה.`)
      : out('would_exit_app', false, 'P2', 0.6, `אין מסך קודם באפליקציה (${before.path}) — באנדרואיד החזרה הייתה יוצאת מהאפליקציה.`);
  }
  const offApp = !appHosts.includes(after.host) || after.url.startsWith('about:') || after.path.startsWith('/qa/');
  if (offApp) return out('left_app', false, 'P1', 0.9, `החזרה יצאה מהאפליקציה (${after.url.slice(0, 80)}).`);
  if (after.textLen < BLANK_TEXT_LEN) return out('blank_page', false, 'P1', 0.9, `אחרי חזרה נשאר דף ריק (${after.path}).`);
  if (before.dialogs > 0) {
    if (after.dialogs < before.dialogs) return out('sheet_closed', true, null, 1, 'המגירה נסגרה, כמצופה.');
    if (after.path !== before.path) return out('went_back', false, 'P2', 0.7, `החזרה עברה מסך (${before.path} → ${after.path}) בלי לסגור קודם את המגירה.`);
    return out('sheet_stayed', false, 'P2', 0.5, 'המגירה נשארה פתוחה אחרי חזרה (ייתכן שבאפליקציה עצמה BackStack סוגר אותה — לבדוק).');
  }
  if (after.path !== before.path) return out('went_back', true, null, 1, `חזר למסך הקודם (${after.path}).`);
  if (after.sig !== before.sig) return out('step_back', true, null, 0.8, 'חזר שלב אחד אחורה באותו מסך.');
  return out('no_change', false, 'P3', 0.4, 'לחיצה על חזרה לא עשתה כלום (ייתכן שבאפליקציה עצמה BackStack מטפל — לבדוק).');
}

/** The tool_result line the tester gets back. */
export function backResultText(o: BackOutcome): string {
  return `back_button → ${o.kind}${o.ok ? ' (ok)' : ` (WRONG, ${o.severity}; the runner recorded it)`} — ${o.he}`;
}
