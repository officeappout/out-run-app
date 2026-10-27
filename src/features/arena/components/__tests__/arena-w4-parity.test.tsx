/**
 * i18n wave 4 (Arena + players layout -> logical classes): Hebrew markup of arena views no earlier parity test renders.
 * Recorded from main BEFORE the codemod; afterwards the files differ ONLY in class names / `dir` attributes / the
 * `ltr:-scale-x-100` mirror class (proved by scripts/i18n/wave4-snapshot-proof.ts).
 */
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => {
  const router = { push() {}, replace() {}, prefetch() {}, back() {} };
  return { useRouter: () => router, usePathname: () => '/arena' };
});

import LockedArenaCard from '../LockedArenaCard';
import { UnitLeagueTableView } from '../UnitLeagueTable';

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/arena-w4/${name}.html`;

it('locked arena card (all three locks)', async () => {
  const parts = [
    html(<LockedArenaCard type="city" />),
    html(<LockedArenaCard type="city_inactive" authorityName="חיפה" />),
    html(<LockedArenaCard type="school" />),
  ];
  await expect(parts.join('\n')).toMatchFileSnapshot(snap('locked'));
});

it('unit league table view (loading + empty + ranges)', async () => {
  const noop = () => {};
  const parts = [
    html(<UnitLeagueTableView range="week" onRangeChange={noop} isLoading onRefresh={noop} result={null} />),
    html(<UnitLeagueTableView range="month" onRangeChange={noop} isLoading={false} onRefresh={noop} result={null} showKm />),
  ];
  await expect(parts.join('\n')).toMatchFileSnapshot(snap('unit-table'));
});
