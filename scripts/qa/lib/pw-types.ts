/**
 * The slice of the Playwright API the runner uses, typed locally. Playwright is NOT a repo
 * dependency (it would pull ~300 MB of browsers into every install): the workflow installs it
 * with `npm install --no-save playwright@<pinned>` right before a run, and ./browser.ts loads
 * it with a dynamic import. Structural types keep tsc happy without the package present.
 */

export interface PwRequest {
  url(): string;
  method(): string;
}

export interface PwResponse {
  url(): string;
  status(): number;
  request(): PwRequest;
}

export interface PwConsoleMessage {
  type(): string;
  text(): string;
}

export interface PwRoute {
  request(): PwRequest;
  abort(): Promise<void>;
  continue(): Promise<void>;
}

export interface PwMouse {
  click(x: number, y: number): Promise<void>;
  move(x: number, y: number, opts?: { steps?: number }): Promise<void>;
  down(): Promise<void>;
  up(): Promise<void>;
  wheel(dx: number, dy: number): Promise<void>;
}

export interface PwKeyboard {
  press(key: string): Promise<void>;
}

export interface PwLocator {
  click(opts?: { timeout?: number; delay?: number }): Promise<void>;
  fill(text: string, opts?: { timeout?: number }): Promise<void>;
  boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  count(): Promise<number>;
  first(): PwLocator;
}

export interface PwPage {
  goto(url: string, opts?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number }): Promise<unknown>;
  goBack(opts?: { timeout?: number }): Promise<unknown>;
  url(): string;
  evaluate<T>(expression: string): Promise<T>;
  screenshot(opts?: { type?: 'png' | 'jpeg'; quality?: number; fullPage?: boolean; scale?: 'css' | 'device' }): Promise<Buffer>;
  locator(selector: string): PwLocator;
  mouse: PwMouse;
  keyboard: PwKeyboard;
  waitForTimeout(ms: number): Promise<void>;
  waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle', opts?: { timeout?: number }): Promise<void>;
  on(event: 'console', cb: (m: PwConsoleMessage) => void): void;
  on(event: 'response', cb: (r: PwResponse) => void): void;
  on(event: 'pageerror', cb: (e: Error) => void): void;
  close(): Promise<void>;
}

export interface PwContext {
  newPage(): Promise<PwPage>;
  setGeolocation(g: { latitude: number; longitude: number; accuracy?: number } | null): Promise<void>;
  setOffline(offline: boolean): Promise<void>;
  addInitScript(script: string): Promise<void>;
  route(url: string | RegExp, handler: (route: PwRoute) => Promise<void> | void): Promise<void>;
  close(): Promise<void>;
}

export interface PwBrowser {
  newContext(opts: Record<string, unknown>): Promise<PwContext>;
  close(): Promise<void>;
}

export interface PwBrowserType {
  launch(opts?: { headless?: boolean }): Promise<PwBrowser>;
}

export interface PwModule {
  webkit: PwBrowserType;
  chromium: PwBrowserType;
}
