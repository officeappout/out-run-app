/**
 * Shared jsdom harness for the onboarding steps' i18n parity tests (namespace `onboarding`).
 * Not a test file. The test files that use it start with `// @vitest-environment jsdom`.
 *
 *  - `motionStub` replaces framer-motion: every `motion.<tag>` is the plain element without the
 *    animation props, AnimatePresence is a fragment, so the markup is deterministic and exits are
 *    instant (pitfall 10/14).
 *  - `mount()` renders with react-dom/client inside act(); `html()` returns the container markup
 *    with `<!-- -->` stripped (react-dom/client emits none; stripped anyway, same rule as the
 *    static-markup parity tests) and React `:rN:` ids normalised.
 */
import { act, createElement, forwardRef, Fragment, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const MOTION_PROPS = new Set([
  'initial', 'animate', 'exit', 'transition', 'variants', 'whileTap', 'whileHover', 'whileInView',
  'whileFocus', 'whileDrag', 'layout', 'layoutId', 'onAnimationComplete', 'onAnimationStart', 'drag',
  'dragConstraints', 'dragElastic', 'dragMomentum', 'onDragEnd', 'onDragStart', 'onDrag', 'custom',
  'viewport', 'onUpdate',
]);

const motionCache = new Map<string, unknown>();
function motionTag(tag: string) {
  let c = motionCache.get(tag);
  if (!c) {
    c = forwardRef<unknown, Record<string, unknown>>((props, ref) => {
      const rest: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) if (!MOTION_PROPS.has(k)) rest[k] = v;
      return createElement(tag, { ...rest, ref });
    });
    motionCache.set(tag, c);
  }
  return c;
}

export const motionStub = {
  motion: new Proxy({}, { get: (_t, tag: string) => motionTag(tag) }),
  AnimatePresence: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
  useReducedMotion: () => false,
  MotionGlobalConfig: {},
};

export interface Mounted {
  container: HTMLDivElement;
  html: () => string;
  /** Clicks the first element matching a CSS selector, or the given element. */
  click: (target: string | Element) => Promise<void>;
  /** Clicks the first button whose text content contains `text`. */
  clickText: (text: string) => Promise<void>;
  /** Clicks the innermost element of any tag whose text content contains `text` (the click bubbles). */
  clickAny: (text: string) => Promise<void>;
  /** Runs fake timers forward inside act(). */
  advance: (ms: number) => Promise<void>;
  /** Sets an input's value and fires React's input event. */
  type: (selector: string, value: string) => Promise<void>;
  unmount: () => void;
}

export function normalise(markup: string): string {
  return markup.replaceAll('<!-- -->', '').replace(/:r[0-9a-z]+:/g, ':r:');
}

export async function mount(el: ReactElement): Promise<Mounted> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(el);
  });
  const click = async (target: string | Element) => {
    const node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!node) throw new Error(`no element for ${String(target)}`);
    await act(async () => {
      (node as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };
  return {
    container,
    html: () => normalise(document.body.innerHTML),
    click,
    clickText: async (text: string) => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
      if (!btn) throw new Error(`no button with text ${text}`);
      await click(btn);
    },
    clickAny: async (text: string) => {
      const all = Array.from(document.body.querySelectorAll('*')).filter((e) => (e.textContent ?? '').includes(text));
      const inner = all.find((e) => !Array.from(e.children).some((c) => (c.textContent ?? '').includes(text)));
      if (!inner) throw new Error(`no element with text ${text}`);
      await click(inner);
    },
    advance: async (ms: number) => {
      const { vi } = await import('vitest');
      await act(async () => {
        vi.advanceTimersByTime(ms);
      });
    },
    type: async (selector: string, value: string) => {
      const input = document.querySelector(selector) as HTMLInputElement | null;
      if (!input) throw new Error(`no input ${selector}`);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
      document.body.innerHTML = '';
    },
  };
}
