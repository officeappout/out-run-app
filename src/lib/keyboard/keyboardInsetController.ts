/**
 * Keyboard inset controller — the ONE place the app tracks the on-screen
 * keyboard. Installed once (see `useKeyboardInsetController`), it publishes:
 *
 *   • `--kb-inset` on <html>  — px of the layout viewport covered by the
 *                               keyboard (0 when closed). Registered with
 *                               @property in globals.css so it animates in
 *                               step with the keyboard instead of jumping.
 *   • `data-kb-open` on <html> — present while the keyboard is open.
 *   • a tiny store (`getKeyboardInset` / `subscribeKeyboardInset`) for React.
 *
 * Sources:
 *   • iOS Capacitor shell → @capacitor/keyboard `keyboardWillShow/WillHide`
 *     (fires BEFORE the keyboard animation, so the CSS transition runs with
 *     it). We also switch the plugin's resize mode to 'none' at runtime: the
 *     configured 'body' mode sets `body.style.height` ~0.45 s AFTER the
 *     keyboard is up and resets it on hide, which is the "layout jumps" the
 *     owner reported — and it never moved fixed sheets/composers anyway.
 *   • everything else (web Safari / Chrome, Android shell) → visualViewport.
 *
 * It also keeps `data-kb-stick-bottom` lists (chat threads) pinned to their
 * newest message while the keyboard resizes them, and (a) undoes the document-level pan iOS applies when an input is
 * focused (<html> is overflow:hidden — the app scrolls inside <main>), which
 * is what snapped the layout "down" after typing, and (b) scrolls the focused
 * field to the middle of the visible area of its own scroll container once
 * the keyboard has settled.
 */

import { computeRevealDelta, opensKeyboard, resolveKeyboardInset } from './inset';

/** Matches the CSS transition on --kb-inset (globals.css) + a small buffer. */
const KEYBOARD_SETTLE_MS = 320;

type Listener = (inset: number) => void;

let currentInset = 0;
const listeners = new Set<Listener>();

export function getKeyboardInset(): number {
  return currentInset;
}

/** True while the controller is installed (flag on). Screens that still have
 *  their own legacy focus-scroll code skip it when this is true. */
export function isKeyboardControllerActive(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-kb-controller');
}

export function subscribeKeyboardInset(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Chat-style lists (`data-kb-stick-bottom`) that were scrolled to the end
 *  stay at the end while the keyboard resizes them (otherwise the newest
 *  messages slide under the composer). Pinned every frame for the length of
 *  the keyboard animation. */
const STICK_THRESHOLD_PX = 80;
function keepStuckListsAtBottom(): void {
  const lists = Array.from(document.querySelectorAll<HTMLElement>('[data-kb-stick-bottom]'))
    .filter((el) => el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX);
  if (lists.length === 0) return;
  const until = performance.now() + KEYBOARD_SETTLE_MS;
  const pin = () => {
    lists.forEach((el) => { el.scrollTop = el.scrollHeight; });
    if (performance.now() < until) window.requestAnimationFrame(pin);
  };
  pin();
}

function publish(inset: number): void {
  if (inset === currentInset) return;
  keepStuckListsAtBottom();
  currentInset = inset;
  const root = document.documentElement;
  root.style.setProperty('--kb-inset', `${inset}px`);
  if (inset > 0) root.setAttribute('data-kb-open', '');
  else root.removeAttribute('data-kb-open');
  listeners.forEach((l) => l(inset));
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function nativePlatform(): string | null {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.getPlatform?.() ?? null;
}

function isScrollable(el: Element): boolean {
  const style = window.getComputedStyle(el);
  const oy = style.overflowY;
  return (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight;
}

function nearestScrollContainer(el: Element): Element | null {
  let node = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    if (isScrollable(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function isTextEntry(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  const input = el as HTMLInputElement;
  return opensKeyboard(
    el.tagName,
    el.tagName === 'INPUT' ? input.getAttribute('type') : null,
    el.isContentEditable,
    'readOnly' in input ? Boolean(input.readOnly) : false,
  );
}

/** Opt-out: put `data-kb-no-reveal` on a field (or an ancestor) that manages
 *  its own scrolling. */
function revealFocused(): void {
  const el = document.activeElement;
  if (!isTextEntry(el) || el.closest('[data-kb-no-reveal]')) return;
  const container = nearestScrollContainer(el);
  if (!container) return; // inside a fixed bar/sheet — lifted by the CSS utilities instead
  const elRect = el.getBoundingClientRect();
  const cRect = container.getBoundingClientRect();
  const delta = computeRevealDelta({
    elTop: elRect.top,
    elBottom: elRect.bottom,
    containerTop: cRect.top,
    containerBottom: cRect.bottom,
    layoutHeight: window.innerHeight,
    inset: currentInset,
  });
  if (delta !== 0) container.scrollBy({ top: delta, behavior: 'smooth' });
}

/** <html>/<body> never scroll in this app; any document scroll is iOS's
 *  focus pan, which later "jumps" back. Undo it. */
function undoDocumentPan(): void {
  const se = document.scrollingElement;
  if ((se && se.scrollTop !== 0) || window.scrollY !== 0) window.scrollTo(0, 0);
  if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
}

/**
 * Install all listeners. Idempotent per call-site; returns a cleanup.
 * SSR-safe (no-op without window).
 */
export function installKeyboardInsetController(): () => void {
  if (typeof window === 'undefined') return () => {};
  document.documentElement.setAttribute('data-kb-controller', '');

  const vv = window.visualViewport ?? null;
  const platform = nativePlatform();
  const useNative = platform === 'ios';

  let nativeHeight: number | null = useNative ? 0 : null;
  let raf = 0;
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const nativeHandles: Array<{ remove: () => Promise<void> | void }> = [];
  /** Set once we switched the plugin to 'none' — restored to the configured
   *  'body' on uninstall (flag turned off) so off == today's behaviour. */
  let restoreResizeMode: (() => void) | null = null;

  const recompute = () => {
    raf = 0;
    const next = resolveKeyboardInset({
      nativeKeyboardHeight: nativeHeight,
      layoutHeight: window.innerHeight,
      visualHeight: vv?.height ?? window.innerHeight,
      visualOffsetTop: vv?.offsetTop ?? 0,
    });
    const opened = next > 0 && currentInset === 0;
    publish(next);
    if (next > 0) undoDocumentPan();
    if (opened) scheduleReveal(KEYBOARD_SETTLE_MS);
  };

  const schedule = () => {
    if (!raf) raf = window.requestAnimationFrame(recompute);
  };

  const scheduleReveal = (ms: number) => {
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      undoDocumentPan();
      revealFocused();
    }, ms);
  };

  const onFocusIn = (e: FocusEvent) => {
    if (!isTextEntry(e.target as Element)) return;
    // Keyboard already up (moving between fields): reveal shortly. Otherwise
    // the open transition in recompute() schedules it after the keyboard
    // settles; this timer is the fallback when no inset event arrives.
    scheduleReveal(currentInset > 0 ? 60 : KEYBOARD_SETTLE_MS + 80);
  };

  const onWindowScroll = () => {
    if (currentInset > 0) undoDocumentPan();
  };

  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', onWindowScroll, { passive: true });
  document.addEventListener('focusin', onFocusIn);

  if (useNative) {
    void (async () => {
      try {
        const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
        if (disposed) return;
        // capacitor.config.ts still says 'body' (switched natively once this
        // flag is proven); runtime 'none' while the flag is on.
        await Keyboard.setResizeMode({ mode: KeyboardResize.None })
          .then(() => {
            restoreResizeMode = () => {
              void Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch(() => {});
            };
            if (disposed) restoreResizeMode();
          })
          .catch(() => {});
        document.body.style.height = '';
        nativeHandles.push(
          await Keyboard.addListener('keyboardWillShow', (info) => {
            nativeHeight = info.keyboardHeight;
            recompute();
          }),
          await Keyboard.addListener('keyboardWillHide', () => {
            nativeHeight = 0;
            recompute();
          }),
        );
        if (disposed) nativeHandles.forEach((h) => void h.remove());
      } catch {
        // Plugin missing in this native build → fall back to visualViewport.
        nativeHeight = null;
        schedule();
      }
    })();
  }

  schedule();

  return () => {
    disposed = true;
    if (raf) window.cancelAnimationFrame(raf);
    if (revealTimer) clearTimeout(revealTimer);
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', onWindowScroll);
    document.removeEventListener('focusin', onFocusIn);
    nativeHandles.forEach((h) => void h.remove());
    restoreResizeMode?.();
    document.documentElement.removeAttribute('data-kb-controller');
    publish(0);
  };
}
