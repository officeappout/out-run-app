/**
 * i18n wave 2 batch ax (namespace `summary`): IdentityUnitsRow + SummarySheet.
 * Snapshots recorded BEFORE the extraction (unmodified main), `<!-- -->` stripped before comparing
 * (react-dom/server's separator between adjacent text nodes; not rendered text).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import IdentityUnitsRow from '../../blocks/IdentityUnitsRow';
import SummarySheet from '../../blocks/SummarySheet';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/summary-ax-blocks-i18n/${name}.html`;

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T12:00:00')); });
afterAll(() => { vi.useRealTimers(); });

describe('identity units row', () => {
  it('boxes', async () => {
    await expect(html(<IdentityUnitsRow durationSeconds={2538} calories={312.4} xp={45.2} />)).toMatchFileSnapshot(snap('boxes'));
  });
  it('inline with xp', async () => {
    await expect(html(<IdentityUnitsRow variant="inline" durationSeconds={2538} calories={312.4} xp={45} />)).toMatchFileSnapshot(snap('inline-xp'));
  });
  it('inline without xp', async () => {
    await expect(html(<IdentityUnitsRow variant="inline" durationSeconds={600} calories={80} />)).toMatchFileSnapshot(snap('inline-noxp'));
  });
});

describe('summary sheet', () => {
  it('open', async () => {
    await expect(html(<SummarySheet open title="הקפות" onClose={() => {}}><p>x</p></SummarySheet>)).toMatchFileSnapshot(snap('sheet-open'));
  });
});
