/** Prop-printing stub for the community parity tests: functions and children are left out of `data-props`. */
import { createElement, type ReactNode } from 'react';

const replacer = (k: string, v: unknown) => (typeof v === 'function' || k === 'children' ? undefined : v);

export const stub = (name: string) => {
  const Stub = (p: Record<string, unknown>) =>
    createElement('div', { 'data-stub': name, 'data-props': JSON.stringify(p, replacer) }, (p.children as ReactNode) ?? null);
  Stub.displayName = `Stub(${name})`;
  return Stub;
};
