import { describe, it, expect, afterEach } from 'vitest';
import { LANDING_FLAGS_CACHE_KEY_MIRROR, isLandingRealFallbackOn } from '../flag';
import {
  hasAnyProgram,
  resolveFallbackLanding,
  resolveBackFallback,
  legacyGatewayRedirect,
  mapLegacyPushPath,
} from '../fallback-routes';
import { FLAGS_CACHE_KEY } from '@/hooks/useFeatureFlags';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';
import { buildExploreMapProfileWrite } from '@/features/user/onboarding/services/gateway-explore-map.service';

function stubWindow(items: Record<string, string>) {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: { getItem: (k: string) => (k in items ? items[k] : null) },
  };
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('enable_landing_real_fallback — registration + sync reader', () => {
  it('is registered fail-closed, with no super-admin override', () => {
    const def = FLAG_DEFS.find((d) => d.key === 'enableLandingRealFallback');
    expect(def).toBeDefined();
    expect(def!.firestoreKey).toBe('enable_landing_real_fallback');
    expect(def!.defaultValue).toBe(false);
    expect(def!.superAdminValue).toBe(false);
  });

  it('reads the same localStorage cache useFeatureFlags writes', () => {
    expect(LANDING_FLAGS_CACHE_KEY_MIRROR).toBe(FLAGS_CACHE_KEY);
  });

  it('off without window / cache / with a broken cache / when not exactly true', () => {
    expect(isLandingRealFallbackOn()).toBe(false);
    stubWindow({});
    expect(isLandingRealFallbackOn()).toBe(false);
    stubWindow({ [LANDING_FLAGS_CACHE_KEY_MIRROR]: '{nope' });
    expect(isLandingRealFallbackOn()).toBe(false);
    stubWindow({ [LANDING_FLAGS_CACHE_KEY_MIRROR]: JSON.stringify({ enableLandingRealFallback: 'true' }) });
    expect(isLandingRealFallbackOn()).toBe(false);
  });

  it('on when the cache says true', () => {
    stubWindow({ [LANDING_FLAGS_CACHE_KEY_MIRROR]: JSON.stringify({ enableLandingRealFallback: true }) });
    expect(isLandingRealFallbackOn()).toBe(true);
  });
});

describe('hasAnyProgram / resolveFallbackLanding', () => {
  it('the quick-signup scaffold has no program → /explorer', () => {
    const scaffold = buildExploreMapProfileWrite('u1', undefined)!;
    expect(hasAnyProgram(scaffold)).toBe(false);
    expect(resolveFallbackLanding(scaffold)).toBe('/explorer');
  });
  it('nothing / garbage → no program', () => {
    expect(hasAnyProgram(null)).toBe(false);
    expect(hasAnyProgram({ progression: 'x', running: 5 })).toBe(false);
    expect(hasAnyProgram({ progression: { domains: [] } })).toBe(false);
  });
  it('strength domain / active program / running program → /home', () => {
    expect(resolveFallbackLanding({ progression: { domains: { upper_body: {} } } })).toBe('/home');
    expect(resolveFallbackLanding({ progression: { activePrograms: [{ id: 'a' }] } })).toBe('/home');
    expect(resolveFallbackLanding({ running: { activeProgram: { id: 'r' } } })).toBe('/home');
  });
});

describe('resolveBackFallback', () => {
  it('/home with a profile, the welcome screen without', () => {
    expect(resolveBackFallback(true)).toBe('/home');
    expect(resolveBackFallback(false)).toBe('/');
  });
});

describe('legacyGatewayRedirect (/gateway, flag on)', () => {
  it('→ / and keeps ?ref only', () => {
    expect(legacyGatewayRedirect('')).toBe('/');
    expect(legacyGatewayRedirect(null)).toBe('/');
    expect(legacyGatewayRedirect('?ref=abc')).toBe('/?ref=abc');
    expect(legacyGatewayRedirect('?utm_source=x&ref=a%20b')).toBe('/?ref=a%20b');
    expect(legacyGatewayRedirect('?utm_source=x')).toBe('/');
  });
});

describe('mapLegacyPushPath (push taps, flag on)', () => {
  it("maps the old 'gateway' target to the welcome / landing router", () => {
    expect(mapLegacyPushPath('/gateway')).toBe('/');
    expect(mapLegacyPushPath('/gateway/')).toBe('/');
    expect(mapLegacyPushPath('/gateway?ref=u9')).toBe('/?ref=u9');
  });
  it('leaves every other target alone', () => {
    for (const p of ['/home', '/map?openPark=1', '/community/g1', '/gateway-x', '/']) {
      expect(mapLegacyPushPath(p)).toBe(p);
    }
  });
});
