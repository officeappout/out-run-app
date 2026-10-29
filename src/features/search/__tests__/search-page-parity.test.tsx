/**
 * Flag-off parity for /search: with enable_unified_search off the page renders today's search
 * (moved verbatim from src/app/search/page.tsx, hash 3cafa478…), and the unified screen only
 * with the flag on. The i18n extraction (library namespace) then changed the file's source but
 * not its Hebrew output — that is pinned by legacy-search-i18n-parity.test.tsx (snapshots taken
 * before the extraction) — so the hash below now pins the post-extraction file: any further
 * edit to the legacy page still has to be deliberate (re-pinned when the hard-coded dir=rtl was dropped, batch 2;
 * the Hebrew output is unchanged, see the snapshot proof).
 */
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('@/features/search/hooks/useUnifiedSearchFlag', () => ({ useUnifiedSearchFlag: () => ({ on: flag.on, loading: false }) }));
vi.mock('@/features/search/legacy/LegacySearchPage', () => ({ default: () => <div data-testid="legacy-search" /> }));
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="unified-search" /> }));

import SearchPage from '@/app/search/page';

describe('/search shell', () => {
  it('flag OFF → today\'s search page', () => {
    flag.on = false;
    const html = renderToStaticMarkup(<SearchPage />);
    expect(html).toContain('legacy-search');
    expect(html).not.toContain('unified-search');
  });
  it('flag ON → unified search', () => {
    flag.on = true;
    const html = renderToStaticMarkup(<SearchPage />);
    expect(html).toContain('unified-search');
    expect(html).not.toContain('legacy-search');
  });
  it('the legacy page is unchanged since the i18n extraction (Hebrew output: legacy-search-i18n-parity)', () => {
    const file = readFileSync(path.resolve(__dirname, '../legacy/LegacySearchPage.tsx'));
    expect(createHash('sha256').update(file).digest('hex')).toBe('9ac1a4491a4754de638a36f88df078022ce2005c040b8f46616a7b02462c7734');
  });
});
