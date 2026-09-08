import { afterEach, describe, expect, it, vi } from 'vitest';

// `firebase/firestore` + `@/lib/firebase` aren't needed for this module-level
// constant, but the file imports them at the top — stub them out so this
// test doesn't need a real Firebase app just to read a string constant.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), addDoc: vi.fn(), getDoc: vi.fn(),
  getDocs: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), increment: vi.fn(),
  orderBy: vi.fn(), query: vi.fn(), serverTimestamp: vi.fn(), Timestamp: class {},
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('SHORT_LINK_DOMAIN — env-var-driven, never hardcoded, for the planned domain cutover', () => {
  it('falls back to https://outrun.co.il when the env var is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHORT_LINK_DOMAIN', '');
    const { SHORT_LINK_DOMAIN, DEFAULT_LINK_DESTINATIONS } = await import('../marketing-links.service');
    expect(SHORT_LINK_DOMAIN).toBe('https://outrun.co.il');
    expect(DEFAULT_LINK_DESTINATIONS.desktopUrl).toBe('https://outrun.co.il');
    expect(DEFAULT_LINK_DESTINATIONS.fallbackUrl).toBe('https://outrun.co.il');
  });

  it('reads the env var when set — this is the entire domain-cutover mechanism', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHORT_LINK_DOMAIN', 'https://appout.co.il');
    const { SHORT_LINK_DOMAIN, DEFAULT_LINK_DESTINATIONS } = await import('../marketing-links.service');
    expect(SHORT_LINK_DOMAIN).toBe('https://appout.co.il');
    expect(DEFAULT_LINK_DESTINATIONS.desktopUrl).toBe('https://appout.co.il');
    expect(DEFAULT_LINK_DESTINATIONS.fallbackUrl).toBe('https://appout.co.il');
  });

  it('never derives from window.location — store destinations (iOS/Android) are untouched by the domain', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHORT_LINK_DOMAIN', 'https://appout.co.il');
    const { DEFAULT_LINK_DESTINATIONS } = await import('../marketing-links.service');
    expect(DEFAULT_LINK_DESTINATIONS.iosUrl).toContain('apps.apple.com');
    expect(DEFAULT_LINK_DESTINATIONS.androidUrl).toContain('play.google.com');
  });
});
