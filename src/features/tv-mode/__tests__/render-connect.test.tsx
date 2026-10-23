// @vitest-environment jsdom
/** The connect screen: accounts type a code only, guests also pick a nickname (no sign-in wall), hosting needs an account. */
import { describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const authState = vi.hoisted(() => ({ currentUser: null as null | { uid: string; isAnonymous: boolean } }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: authState }));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: () => () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }), useSearchParams: () => new URLSearchParams() }));

import TvConnectScreen from '../phone/TvConnectScreen';
import { useTvPhoneStore } from '../phone/phone-store';

const pendingHost = { info: { title: 't', kind: 'strength' as const, durationMin: 30, exerciseCount: 4 }, onStart: () => {} };
// The store is read on the client here (jsdom) — static SSR markup would only see the store's initial state.
function render(): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<TvConnectScreen />));
  const html = host.innerHTML;
  act(() => root.unmount());
  return html;
}

describe('TvConnectScreen identities', () => {
  it('guest joining a room: nickname field + "join the room" button, no sign-in wall, no hosting note', () => {
    authState.currentUser = { uid: 'g', isAnonymous: true };
    useTvPhoneStore.getState().reset();
    const html = render();
    expect(html).toContain('id="tv-nickname"');
    expect(html).toContain('כינוי');
    expect(html).toContain('הכינוי יופיע על המסך הגדול');
    expect(html).toContain('הצטרפות לחדר');
    expect(html).not.toContain('צריך להיות מחוברים');
    expect(html).not.toContain('role="note"');
  });
  it('guest who came through ⋯ (wants to host): told hosting needs an account, can still join as a guest', () => {
    authState.currentUser = { uid: 'g', isAnonymous: true };
    useTvPhoneStore.getState().openPair(pendingHost);
    const html = render();
    expect(html).toContain('role="note"');
    expect(html).toContain('הצגת אימון על מסך גדול דורשת חשבון באפליקציה');
    expect(html).toContain('id="tv-nickname"');
  });
  it('account: no nickname field, the usual connect button', () => {
    authState.currentUser = { uid: 'a', isAnonymous: false };
    useTvPhoneStore.getState().openPair(pendingHost);
    const html = render();
    expect(html).not.toContain('id="tv-nickname"');
    expect(html).not.toContain('role="note"');
    expect(html).toContain('התחברות למסך');
  });
});
