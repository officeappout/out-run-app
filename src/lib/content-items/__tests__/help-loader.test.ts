/** The one help loader: site_content when there is content, the code entries otherwise. */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const st = vi.hoisted(() => ({ items: [] as unknown[], fail: false, calls: 0 }));
vi.mock('@/lib/content-items/store.server', () => ({
  listContentItems: async () => {
    st.calls++;
    if (st.fail) throw new Error('unreachable');
    return st.items;
  },
}));

import { getAppHelpEntries, getHelpEntries, isUsingSyncedHelp, loadHelpEntries, setRemoteHelpEntries } from '@/lib/app-help/loader';
import { APP_HELP_ENTRIES } from '@/lib/ai/coach/app-help/entries';
import { ROUND4_HELP_ENTRIES } from '@/lib/app-help/round4-entries';
import { __resetHelpPrime, primeHelpEntries } from '../help-prime.server';
import { __resetContentCache } from '../client';

const remoteItem = (slug: string, q: string) => ({ id: `help-${slug}`, type: 'help', slug, q, a: ['תשובה מהניהול'], tags: ['מילה'], audience: 'users', topic: 'schedule', locale: 'he', status: 'published', order: 0, updatedAt: 0, updatedBy: 'x' });
const CODE_COUNT = APP_HELP_ENTRIES.length + ROUND4_HELP_ENTRIES.length;

afterEach(() => {
  setRemoteHelpEntries(null);
  __resetHelpPrime();
  __resetContentCache();
  st.items = [];
  st.fail = false;
  st.calls = 0;
  vi.unstubAllGlobals();
});

describe('code fallback', () => {
  it('nothing synced → the code entries (hub + Kelly round 4)', () => {
    expect(isUsingSyncedHelp()).toBe(false);
    expect(getHelpEntries()).toHaveLength(CODE_COUNT);
    expect(getAppHelpEntries({ round4: true })).toHaveLength(CODE_COUNT);
  });
  it('Kelly without round 4 is ALWAYS exactly APP_HELP_ENTRIES (byte-identical path)', () => {
    setRemoteHelpEntries([{ id: 'x', q: 'q', a: ['a'], tags: [], audience: 'users', topic: 't', locale: 'he' }]);
    expect(getAppHelpEntries()).toBe(APP_HELP_ENTRIES);
  });
});

describe('server prime (Kelly)', () => {
  it('content in the collection → used by the hub and Kelly', async () => {
    st.items = [remoteItem('schedule', 'איך מזיזים אימון? (מהניהול)')];
    await primeHelpEntries({} as never, 1000);
    expect(isUsingSyncedHelp()).toBe(true);
    expect(getHelpEntries()).toEqual([{ id: 'schedule', q: 'איך מזיזים אימון? (מהניהול)', a: ['תשובה מהניהול'], tags: ['מילה'], audience: 'users', topic: 'schedule', locale: 'he' }]);
    expect(getAppHelpEntries({ round4: true })[0]).toEqual({ id: 'schedule', title: 'איך מזיזים אימון? (מהניהול)', keywords: ['מילה'], answer: 'תשובה מהניהול' });
  });
  it('empty collection → code fallback', async () => {
    setRemoteHelpEntries([{ id: 'x', q: 'q', a: ['a'], tags: [], audience: 'users', topic: 't', locale: 'he' }]);
    await primeHelpEntries({} as never, 1000);
    expect(isUsingSyncedHelp()).toBe(false);
    expect(getHelpEntries()).toHaveLength(CODE_COUNT);
  });
  it('unreachable → keeps what it had, never throws; refreshes at most every 5 min', async () => {
    st.items = [remoteItem('a', 'A')];
    await primeHelpEntries({} as never, 1000);
    st.fail = true;
    await primeHelpEntries({} as never, 2000); // within TTL → no read at all
    expect(st.calls).toBe(1);
    await primeHelpEntries({} as never, 1000 + 5 * 60_000 + 1);
    expect(st.calls).toBe(2);
    expect(getHelpEntries().map((h) => h.id)).toEqual(['a']);
  });
});

describe('browser load (hub)', () => {
  it('reads the public API; unreachable → code entries', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await loadHelpEntries()).toHaveLength(CODE_COUNT);
  });
  it('API with help items → those', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [remoteItem('kelly', 'מה קלי יודע?')] }) })));
    expect((await loadHelpEntries()).map((h) => h.id)).toEqual(['kelly']);
  });
});
