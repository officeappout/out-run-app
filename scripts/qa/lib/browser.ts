/**
 * Opens ONE phone-sized browser for a session (never two at once — design §4).
 *   - device profile from ./config (iPhone 13 by default; WebKit for iPhones, Chromium for Android)
 *   - locale he-IL, Asia/Jerusalem, geolocation granted (fed by the GPS simulator), no notifications
 *   - App Check debug token injected before the app boots (only this browser — never the app's env)
 *   - analytics / payment hosts aborted; console errors + failed requests collected for the linters
 */
import { BLOCKED_REQUEST_HOSTS, type DeviceProfile } from './config';
import { isBlockedRequestHost, redactSecrets } from './demo-guard';
import type { RuntimeErrors } from './lint/rules';
import type { PwBrowser, PwContext, PwModule, PwPage } from './pw-types';

export interface OpenBrowser {
  browser: PwBrowser;
  context: PwContext;
  page: PwPage;
  /** The device's full viewport (the keyboard tool shrinks and restores it). */
  viewport: { width: number; height: number };
  /** Errors since the last drain (the linters read and reset them each step). */
  drainErrors(): RuntimeErrors;
  close(): Promise<void>;
}

const PLAYWRIGHT = 'playwright';

async function loadPlaywright(): Promise<PwModule> {
  try {
    return (await import(/* runtime-only dependency */ PLAYWRIGHT)) as PwModule;
  } catch {
    throw new Error('playwright is not installed. Run: npm install --no-save playwright@1.55.0 && npx playwright install --with-deps webkit');
  }
}

export async function openBrowser(device: DeviceProfile, opts: { appCheckDebugToken: string | null; startAt: { latitude: number; longitude: number } }): Promise<OpenBrowser> {
  const pw = await loadPlaywright();
  const browser = await (device.engine === 'webkit' ? pw.webkit : pw.chromium).launch({ headless: true });
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.engine === 'chromium' ? device.isMobile : undefined,
    hasTouch: device.hasTouch,
    userAgent: device.userAgent,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    permissions: ['geolocation'],
    geolocation: { ...opts.startAt, accuracy: 10 },
    serviceWorkers: 'block',
  });

  if (opts.appCheckDebugToken) {
    // Read by the Firebase JS SDK before initializeAppCheck (design §7.2 item 5).
    await context.addInitScript(`self.FIREBASE_APPCHECK_DEBUG_TOKEN = ${JSON.stringify(opts.appCheckDebugToken)};`);
  }
  // Notifications are never granted; make the API look "denied" so the app doesn't prompt.
  await context.addInitScript(`try { Object.defineProperty(window, 'Notification', { value: { permission: 'denied', requestPermission: () => Promise.resolve('denied') } }); } catch (e) {}`);

  const hostRe = new RegExp(`(${BLOCKED_REQUEST_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|')})`);
  await context.route(hostRe, async (route) => {
    if (isBlockedRequestHost(route.request().url())) await route.abort();
    else await route.continue();
  });

  const page = await context.newPage();
  let consoleErrors: string[] = [];
  let failed: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && consoleErrors.length < 50) consoleErrors.push(redactSecrets(m.text()).slice(0, 200));
  });
  page.on('pageerror', (e) => {
    if (consoleErrors.length < 50) consoleErrors.push(redactSecrets(`pageerror: ${e.message}`).slice(0, 200));
  });
  page.on('response', (r) => {
    const s = r.status();
    if (s >= 400 && failed.length < 50 && !isBlockedRequestHost(r.url())) {
      let path = r.url();
      try {
        const u = new URL(r.url());
        path = `${u.hostname}${u.pathname}`;
      } catch {
        /* keep raw */
      }
      failed.push(`${s} ${r.request().method()} ${redactSecrets(path).slice(0, 160)}`);
    }
  });

  return {
    browser,
    context,
    page,
    viewport: { ...device.viewport },
    drainErrors() {
      const out = { console: consoleErrors, failedRequests: failed };
      consoleErrors = [];
      failed = [];
      return out;
    },
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}
