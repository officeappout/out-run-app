/**
 * enable_where_to_train_v1 — the own profile's "שותפי אימון" row: title + count over the shared
 * highlights strip; the list sheet renders the same partners (v2 Sheet mocked in place — it portals).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/ui/v2/Sheet', () => ({
  default: ({ open, title, children }: { open: boolean; title?: React.ReactNode; children?: React.ReactNode }) =>
    open ? <div data-sheet><h2>{title}</h2>{children}</div> : null,
}));

import TrainingPartnersRow from '../partners/TrainingPartnersRow';
import PartnersListSheet from '../partners/PartnersListSheet';

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const partners = [{ uid: 'a', name: 'נועה', photoURL: null }, { uid: 'b', name: 'דן', photoURL: null }];
const noop = () => {};

describe('TrainingPartnersRow', () => {
  it('title + count + avatars', () => {
    const out = html(<TrainingPartnersRow partners={partners} loading={false} onPartnerClick={noop} onAddClick={noop} />);
    expect(out).toContain('שותפי אימון');
    expect(out).toMatch(/tabular-nums[^>]*>2</);
    expect(out).toContain('נועה');
  });
  it('no count while loading', () => {
    expect(html(<TrainingPartnersRow partners={[]} loading onPartnerClick={noop} onAddClick={noop} />)).not.toContain('tabular-nums');
  });
});

describe('PartnersListSheet', () => {
  it('lists every partner; empty state explains mutual follow', () => {
    expect(html(<PartnersListSheet open onClose={noop} partners={partners} onPartnerClick={noop} />)).toContain('דן');
    expect(html(<PartnersListSheet open onClose={noop} partners={[]} onPartnerClick={noop} />)).toContain('עוד אין שותפי אימון');
  });
});
