/**
 * Shared helpers for the "split a monster file" parity suites
 * (community-page-split-parity / create-group-wizard-split-parity).
 *
 * The suites render a screen in jsdom with every child surface stubbed to a
 * <div data-stub> that prints its props, then snapshot the DOM plus a log of
 * every service / router call. A pure refactor must reproduce both byte for
 * byte, in either enable_home_v2 state.
 */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// ── Stable serialisation ────────────────────────────────────────────────────

export function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v === undefined) return '‹undef›';
    if (typeof v === 'function') return 'ƒ';
    if (v instanceof Set) return { __set: Array.from(v) };
    if (v instanceof Map) return { __map: Array.from(v.entries()) };
    if (v instanceof Date) return { __date: v.toISOString() };
    if (React.isValidElement(v)) return '‹element›';
    return v;
  });
}

// ── Prop-printing stubs ─────────────────────────────────────────────────────

/** Latest props each stub received — tests call their callbacks. */
export const registry: Record<string, Record<string, unknown>> = {};

export function stub(name: string) {
  const Stub = (allProps: Record<string, unknown>) => {
    const { children, ...props } = allProps;
    registry[name] = props;
    return (
      <div data-stub={name} data-props={serialize(props)}>
        {typeof children === 'function' ? null : (children as React.ReactNode)}
      </div>
    );
  };
  Stub.displayName = `Stub(${name})`;
  return Stub;
}

// ── Call log (services, router) ─────────────────────────────────────────────

export const calls: string[] = [];
export function logCall(name: string, ...args: unknown[]) {
  calls.push(`${name}(${args.map((a) => serialize(a)).join(', ')})`);
}

// ── framer-motion stand-in: plain elements, motion props printed ───────────

const MOTION_KEYS = ['initial', 'animate', 'exit', 'transition', 'whileTap', 'whileHover', 'layout', 'variants', 'drag', 'dragConstraints', 'dragElastic', 'onDragEnd', 'custom'];

function motionFactory(tag: string) {
  const C = React.forwardRef<unknown, Record<string, unknown>>(function MotionStub(props, ref) {
    const rest: Record<string, unknown> = {};
    const motionProps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (MOTION_KEYS.includes(k)) motionProps[k] = v;
      else rest[k] = v;
    }
    return React.createElement(tag, { ...rest, ref, 'data-motion': serialize(motionProps) });
  });
  return C;
}

const motionProxy = new Proxy({} as Record<string, unknown>, {
  get: (cache, tag: string) => {
    if (!cache[tag]) cache[tag] = motionFactory(tag);
    return cache[tag];
  },
});

export const framerMock = {
  motion: motionProxy,
  m: motionProxy,
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
  useDragControls: () => ({ start: () => {} }),
  useMotionValue: (v: unknown) => ({ get: () => v, set: () => {} }),
  useTransform: () => ({ get: () => 0 }),
  useAnimation: () => ({ start: async () => {} }),
  LazyMotion: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  domAnimation: {},
};

// ── DOM driving ─────────────────────────────────────────────────────────────

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

export async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

export async function mount(el: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(el));
  await flush();
}

export async function rerender(el: React.ReactElement) {
  await act(async () => root!.render(el));
  await flush();
}

export function unmount() {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  root = null;
  host = null;
}

/** The DOM + every call so far, as one snapshot string. */
export function snapshot(): string {
  return `${document.body.innerHTML}\n── calls ──\n${calls.join('\n')}`;
}

/** Clicks the first <button> whose text content (trimmed) matches. */
export async function clickButton(match: string | RegExp, nth = 0) {
  const all = Array.from(document.querySelectorAll('button')).filter((b) => {
    const txt = (b.textContent ?? '').trim();
    return typeof match === 'string' ? txt === match : match.test(txt);
  });
  const btn = all[nth];
  if (!btn) throw new Error(`no button matching ${String(match)}`);
  await act(async () => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
}

export async function clickSelector(selector: string) {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) throw new Error(`no element ${selector}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
}

/** Types into an input/textarea the way React listens for it. */
export async function typeInto(selector: string, value: string) {
  const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) throw new Error(`no field ${selector}`);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  await act(async () => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
}

/** Invokes a stub's callback prop inside act. */
export async function callProp(stubName: string, prop: string, ...args: unknown[]) {
  const fn = registry[stubName]?.[prop];
  if (typeof fn !== 'function') throw new Error(`${stubName}.${prop} is not a function`);
  await act(async () => {
    (fn as (...a: unknown[]) => unknown)(...args);
  });
  await flush();
}

export function resetHarness() {
  calls.length = 0;
  for (const k of Object.keys(registry)) delete registry[k];
}
