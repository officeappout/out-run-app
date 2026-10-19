import { describe, it, expect, afterEach } from 'vitest';
import { FLAGS_CACHE_KEY_MIRROR, isFastStartupOn } from '../flag';
import { FLAGS_CACHE_KEY } from '@/hooks/useFeatureFlags';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

function stubWindow(items: Record<string, string>) {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: { getItem: (k: string) => (k in items ? items[k] : null) },
  };
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('enable_fast_startup_v1', () => {
  it('is registered fail-closed, with no super-admin override', () => {
    const def = FLAG_DEFS.find((d) => d.key === 'enableFastStartupV1');
    expect(def).toBeDefined();
    expect(def!.firestoreKey).toBe('enable_fast_startup_v1');
    expect(def!.defaultValue).toBe(false);
    expect(def!.superAdminValue).toBe(false);
  });

  it('reads the same localStorage cache useFeatureFlags writes', () => {
    expect(FLAGS_CACHE_KEY_MIRROR).toBe(FLAGS_CACHE_KEY);
  });

  it('off without window / without cache / with a broken cache / when false', () => {
    expect(isFastStartupOn()).toBe(false);
    stubWindow({});
    expect(isFastStartupOn()).toBe(false);
    stubWindow({ [FLAGS_CACHE_KEY_MIRROR]: '{not json' });
    expect(isFastStartupOn()).toBe(false);
    stubWindow({ [FLAGS_CACHE_KEY_MIRROR]: JSON.stringify({ enableFastStartupV1: false }) });
    expect(isFastStartupOn()).toBe(false);
    stubWindow({ [FLAGS_CACHE_KEY_MIRROR]: JSON.stringify({ enableFastStartupV1: 'true' }) });
    expect(isFastStartupOn()).toBe(false);
  });

  it('on only when the cached panel value is exactly true', () => {
    stubWindow({ [FLAGS_CACHE_KEY_MIRROR]: JSON.stringify({ enableFastStartupV1: true }) });
    expect(isFastStartupOn()).toBe(true);
  });
});
