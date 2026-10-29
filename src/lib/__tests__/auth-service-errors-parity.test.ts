// @vitest-environment jsdom
/** i18n extraction batch 3: the user-facing error strings of auth.service. Recorded from unmodified origin/main (commit 1). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = { google: {} as Record<string, unknown>, apple: {} as Record<string, unknown> };
vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: {
    signInWithGoogle: async () => ({ credential: native.google }),
    signInWithApple: async () => ({ credential: native.apple }),
  },
}));
const fb = { sendFails: false };
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(), signInWithEmailAndPassword: vi.fn(), signOut: vi.fn(), onAuthStateChanged: vi.fn(),
  updateProfile: vi.fn(), GoogleAuthProvider: { credential: vi.fn() }, OAuthProvider: class {}, signInWithPopup: vi.fn(),
  signInWithCredential: vi.fn(), signInAnonymously: vi.fn(), getAdditionalUserInfo: vi.fn(), linkWithPopup: vi.fn(), linkWithCredential: vi.fn(),
  EmailAuthProvider: {}, isSignInWithEmailLink: vi.fn(), signInWithEmailLink: vi.fn(),
  sendSignInLinkToEmail: async () => { if (fb.sendFails) throw new Error('boom'); },
}));
vi.mock('../firebase', () => ({ auth: { currentUser: { isAnonymous: true } } }));
vi.mock('../mapPrefs', () => ({ clearMapPrefs: vi.fn() }));
vi.mock('../sessionHealth.store', () => ({ useSessionHealthStore: { getState: () => ({}) } }));

import * as svc from '../auth.service';

beforeEach(() => {
  (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); delete (window as unknown as { Capacitor?: unknown }).Capacitor; });

describe('auth.service user-facing errors (Hebrew)', () => {
  it('no identity token from Google / Apple, missing nonce', async () => {
    native.google = {}; native.apple = {};
    const out: unknown[] = [];
    out.push(await svc.signInWithGoogle(), await svc.signInWithApple(), await svc.linkGoogleAccount(), await svc.linkWithGoogleAccount(), await svc.linkWithAppleAccount());
    native.apple = { idToken: 'x' };
    out.push(await svc.signInWithApple(), await svc.linkWithAppleAccount());
    await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot('./__snapshots__/auth-errors/native.json');
  });

  it('login-link gate and magic link', async () => {
    const out: unknown[] = [];
    vi.stubGlobal('fetch', async () => ({ status: 429, json: async () => ({}) }));
    out.push(await svc.checkLoginLinkGate('a@b.co'));
    vi.stubGlobal('fetch', async () => ({ status: 429, json: async () => ({ error: 'server says no' }) }));
    out.push(await svc.checkLoginLinkGate('a@b.co'));
    vi.stubGlobal('fetch', async () => ({ status: 200, json: async () => ({}) }));
    fb.sendFails = true;
    out.push(await svc.sendMagicLinkRateLimited('a@b.co'));
    fb.sendFails = false;
    await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot('./__snapshots__/auth-errors/magic-link.json');
  });
});
