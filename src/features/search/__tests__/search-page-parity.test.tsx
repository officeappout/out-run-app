/**
 * Flag-off parity for /search: with enable_unified_search off the page renders today's search
 * (moved verbatim — the file hash below is origin/main's src/app/search/page.tsx before the
 * move), and the unified screen only with the flag on.
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
  it('the legacy page is byte-identical to the pre-move /search page', () => {
    const file = readFileSync(path.resolve(__dirname, '../legacy/LegacySearchPage.tsx'));
    expect(createHash('sha256').update(file).digest('hex')).toBe('3cafa4787c9ed90b4c6e83e07286953dc4274724c04899e0bf75fdd23ed3b250');
  });
});
