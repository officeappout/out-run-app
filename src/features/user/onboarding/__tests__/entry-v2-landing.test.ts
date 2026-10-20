import { describe, it, expect } from 'vitest';
import {
  ENTRY_V2_LANDING_KEY,
  ENTRY_V2_MAP_URL,
  consumeEntryV2Landing,
  isEntryV2Landing,
  markEntryV2Landing,
} from '../entry-v2-landing';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}
const params = (q: string) => new URLSearchParams(q);

describe('entry v2 landing contract', () => {
  it('the map URL keeps fromExplorer and adds entry=v2', () => {
    const u = new URL(ENTRY_V2_MAP_URL, 'https://x.test');
    expect(u.pathname).toBe('/map');
    expect(u.searchParams.get('fromExplorer')).toBe('true');
    expect(u.searchParams.get('entry')).toBe('v2');
  });
  it('mark → isLanding → consume fires once', () => {
    const s = memoryStorage();
    expect(isEntryV2Landing(s)).toBe(false);
    markEntryV2Landing(s);
    expect(s.raw.get(ENTRY_V2_LANDING_KEY)).toBe('1');
    expect(isEntryV2Landing(s)).toBe(true);
    expect(consumeEntryV2Landing(s)).toBe(true);
    expect(consumeEntryV2Landing(s)).toBe(false);
  });
  it('the URL param alone is enough (first render, before MapShell cleans the URL)', () => {
    const s = memoryStorage();
    expect(isEntryV2Landing(s, params('fromExplorer=true&entry=v2'))).toBe(true);
    expect(isEntryV2Landing(s, params('fromExplorer=true'))).toBe(false);
    expect(isEntryV2Landing(s, params('entry=v3'))).toBe(false);
  });
  it('storage that throws / is missing never throws', () => {
    const bad = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(() => markEntryV2Landing(bad)).not.toThrow();
    expect(isEntryV2Landing(bad)).toBe(false);
    expect(consumeEntryV2Landing(bad, params('entry=v2'))).toBe(true);
    expect(isEntryV2Landing(null)).toBe(false);
  });
});
