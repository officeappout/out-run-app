import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { isDesignDemoEnabled } from '../demo-access';

describe('isDesignDemoEnabled', () => {
  it('denies Vercel production (NODE_ENV=production)', () => {
    expect(isDesignDemoEnabled({ VERCEL_ENV: 'production', NODE_ENV: 'production' })).toBe(false);
  });

  it('denies Vercel production even when NODE_ENV=development', () => {
    expect(isDesignDemoEnabled({ VERCEL_ENV: 'production', NODE_ENV: 'development' })).toBe(false);
  });

  it('allows Vercel preview', () => {
    expect(isDesignDemoEnabled({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe(true);
  });

  it('allows local development with no VERCEL_ENV', () => {
    expect(isDesignDemoEnabled({ NODE_ENV: 'development' })).toBe(true);
  });

  it('denies a plain production NODE_ENV with no VERCEL_ENV', () => {
    expect(isDesignDemoEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('denies an unknown VERCEL_ENV', () => {
    expect(isDesignDemoEnabled({ VERCEL_ENV: 'staging', NODE_ENV: 'production' })).toBe(false);
    expect(isDesignDemoEnabled({ VERCEL_ENV: 'staging', NODE_ENV: 'development' })).toBe(false);
  });

  it('denies when nothing is set', () => {
    expect(isDesignDemoEnabled({})).toBe(false);
  });
});

describe('design-v2 demo pages use the shared gate', () => {
  const root = path.resolve(__dirname, '..');
  for (const page of ['summary', 'steps', 'leagues', 'guided']) {
    it(`${page}/page.tsx gates on isDesignDemoEnabled(), not a bare NODE_ENV check`, () => {
      const src = readFileSync(path.join(root, page, 'page.tsx'), 'utf8');
      expect(src).toMatch(/import\s*\{\s*isDesignDemoEnabled\s*\}\s*from\s*['"]\.\.\/demo-access['"]/);
      expect(src).toMatch(/if\s*\(\s*!isDesignDemoEnabled\(\)\s*\)\s*notFound\(\)/);
      expect(src).not.toMatch(/process\.env\.NODE_ENV/);
      expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
    });
  }
});
