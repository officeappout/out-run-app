import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import('../domain');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('domain config — the single domain switch', () => {
  it('defaults to today\'s live domain', async () => {
    const d = await load({ NEXT_PUBLIC_APP_DOMAIN: '', NEXT_PUBLIC_APP_LEGACY_DOMAINS: '' });
    expect(d.APP_DOMAIN).toBe('outrun.co.il');
    expect(d.APP_ORIGIN).toBe('https://outrun.co.il');
    expect(d.ADMIN_HOSTS).toEqual(['admin.outrun.co.il', 'admin.outrun.local']);
    expect(d.PORTAL_HOSTS).toEqual(['portal.outrun.co.il', 'portal.outrun.local']);
    expect(d.SITE_HOSTS).toEqual(['outrun.co.il', 'www.outrun.co.il']);
  });

  it('one env value moves everything, and the legacy domain keeps being recognised', async () => {
    const d = await load({ NEXT_PUBLIC_APP_DOMAIN: 'appout.co.il', NEXT_PUBLIC_APP_LEGACY_DOMAINS: 'outrun.co.il' });
    expect(d.APP_ORIGIN).toBe('https://appout.co.il');
    expect(d.ADMIN_HOSTS).toEqual(['admin.appout.co.il', 'admin.outrun.co.il', 'admin.outrun.local']);
    expect(d.PORTAL_HOSTS).toContain('portal.outrun.co.il');
    expect(d.SITE_HOSTS).toEqual(['appout.co.il', 'www.appout.co.il', 'outrun.co.il', 'www.outrun.co.il']);
  });

  it('tolerates a scheme, trailing slash, casing and a duplicate legacy entry', async () => {
    const d = await load({ NEXT_PUBLIC_APP_DOMAIN: ' https://AppOut.co.il/ ', NEXT_PUBLIC_APP_LEGACY_DOMAINS: 'appout.co.il, ,https://outrun.co.il' });
    expect(d.APP_DOMAIN).toBe('appout.co.il');
    expect(d.LEGACY_APP_DOMAINS).toEqual(['outrun.co.il']);
  });
});
