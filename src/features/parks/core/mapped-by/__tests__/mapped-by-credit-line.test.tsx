// @vitest-environment jsdom
/**
 * MappedByCreditLine (enable_park_mapped_by_credit) — rendered with
 * react-dom/client in jsdom so the userPublic read (an effect) really runs.
 * firebase/firestore's getDoc is replaced by a fake userPublic store.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const store: { docs: Record<string, Record<string, unknown>>; fail: boolean; reads: string[] } = { docs: {}, fail: false, reads: [] };

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  getDoc: async (ref: { col: string; id: string }) => {
    store.reads.push(`${ref.col}/${ref.id}`);
    if (store.fail) throw new Error('permission-denied');
    const d = store.docs[ref.id];
    return { exists: () => d !== undefined, data: () => d };
  },
}));

import MappedByCreditLine, { type MappedByPerson } from '../MappedByCreditLine';
import type { ParkMappedBy } from '../mapped-by';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null; host = null;
  store.docs = {}; store.fail = false; store.reads = [];
});

async function render(mappedBy: ParkMappedBy | undefined, onOpenProfile?: (p: MappedByPerson) => void) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<MappedByCreditLine mappedBy={mappedBy} onOpenProfile={onOpenProfile} />); });
  await act(async () => { await Promise.resolve(); });
  return host;
}

const COMMUNITY: ParkMappedBy = { kind: 'community', uid: 'u1', contributionId: 'c1' };

describe('MappedByCreditLine', () => {
  it('public adult → photo + name; tap opens the profile with that person', async () => {
    store.docs.u1 = { name: 'דנה כהן', photoURL: 'https://cdn/p.jpg', ageGroup: 'adult' };
    const opened: MappedByPerson[] = [];
    const el = await render(COMMUNITY, (p) => opened.push(p));
    const btn = el.querySelector('button')!;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('מופה על ידי דנה כהן');
    expect(btn.getAttribute('aria-label')).toBe('מופה על ידי דנה כהן. פתיחת הפרופיל');
    expect(btn.querySelector('img')?.getAttribute('src')).toBe('https://cdn/p.jpg');
    act(() => btn.click());
    expect(opened).toEqual([{ uid: 'u1', name: 'דנה כהן', photoURL: 'https://cdn/p.jpg' }]);
    expect(store.reads).toEqual(['userPublic/u1']);
  });

  it('public adult without a photo → initial avatar', async () => {
    store.docs.u1 = { name: 'דנה', ageGroup: 'adult' };
    const el = await render(COMMUNITY);
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('button')?.textContent).toBe('דמופה על ידי דנה');
  });

  it.each([
    ['a minor', { name: 'נועה', ageGroup: 'minor' }],
    ['ageGroup missing', { name: 'נועה' }],
  ])('%s → "מופה על ידי קהילת OUT", no name, no button', async (_label, docData) => {
    store.docs.u1 = docData;
    const el = await render(COMMUNITY);
    expect(el.textContent).toBe('מופה על ידי קהילת OUT');
    expect(el.textContent).not.toContain('נועה');
    expect(el.querySelector('button')).toBeNull();
  });

  it('private profile (no userPublic doc) → community', async () => {
    const el = await render(COMMUNITY);
    expect(el.textContent).toBe('מופה על ידי קהילת OUT');
  });

  it('read fails (e.g. signed-out viewer) → community, never a uid', async () => {
    store.fail = true;
    const el = await render(COMMUNITY);
    expect(el.textContent).toBe('מופה על ידי קהילת OUT');
    expect(el.innerHTML).not.toContain('u1');
  });

  it('team → "מופה על ידי צוות OUT", zero reads', async () => {
    const el = await render({ kind: 'team' });
    expect(el.textContent).toBe('מופה על ידי צוות OUT');
    expect(store.reads).toEqual([]);
  });

  it('anonymous community (no uid stored) → community, zero reads', async () => {
    const el = await render({ kind: 'community', contributionId: 'c1' });
    expect(el.textContent).toBe('מופה על ידי קהילת OUT');
    expect(store.reads).toEqual([]);
  });

  it.each([[undefined], [{ kind: 'authority' } as ParkMappedBy]])('unknown / authority (%o) → renders nothing, zero reads', async (m) => {
    const el = await render(m);
    expect(el.innerHTML).toBe('');
    expect(store.reads).toEqual([]);
  });
});
