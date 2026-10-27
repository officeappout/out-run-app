/**
 * i18n batch au (namespace `onboarding`, keys `entryHeadline.*`): the entry globe's headline, recorded BEFORE the
 * extraction (it was read from entry-copy.ts). `<!-- -->` is stripped before comparing.
 */
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const strip = ({ initial, animate, exit, transition, ...rest }: Record<string, unknown>) => rest;
  return {
    useReducedMotion: () => false,
    AnimatePresence: ({ children }: { children: unknown }) => children,
    motion: { span: (p: Record<string, unknown>) => React.createElement('span', strip(p)) },
  };
});

import { EntryGlobeHeadline } from '../entry-globe/EntryGlobeHeadline';

it('headline (first goal shown, all goals stacked)', async () => {
  const html = renderToStaticMarkup(<EntryGlobeHeadline />).replaceAll('<!-- -->', '');
  await expect(html).toMatchFileSnapshot('./__snapshots__/location-i18n/entry-headline.html');
});
