/**
 * i18n extraction batch ui-2 (namespace `map`, `partnerBubbles.*`): PartnerBubbles copy moves to the catalog.
 * Snapshots recorded from unmodified origin/main (`<!-- -->` stripped); the extracted component must render the same
 * Hebrew markup. Zustand stores render their INITIAL state under react-dom/server.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { PartnerBubbles } from '../PartnerBubbles';
import { useLocaleStore } from '@/store/useLocaleStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/partner-bubbles-i18n/${name}.html`;
const noop = () => {};

beforeEach(() => {
  Object.assign(useLocaleStore.getInitialState(), { gender: 'other' });
});

it.each([
  ['zero', 0, 0],
  ['some', 7, 3],
  ['thousands', 1234, 2048],
])('bubbles %s', async (name, live, scheduled) => {
  await expect(html(<PartnerBubbles liveCount={live} scheduledCount={scheduled} onSelectLive={noop} onSelectScheduled={noop} />)).toMatchFileSnapshot(
    snap(name),
  );
});
