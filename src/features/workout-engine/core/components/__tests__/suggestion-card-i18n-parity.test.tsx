/**
 * i18n extraction batch ui-2 (namespace `player`, `suggestion.*`): SuggestionCard's default CTA and loading label.
 * Snapshots recorded from unmodified origin/main (`<!-- -->` stripped).
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { SuggestionCard } from '../SuggestionCard';
import { useLocaleStore } from '@/store/useLocaleStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/suggestion-card-i18n/${name}.html`;
const suggestion = {
  id: 's1',
  title: 'ריצה קלה',
  subtitle: 'בפארק הקרוב',
  difficulty: 2,
  structure: { durationMin: 35 },
} as never;

beforeEach(() => {
  Object.assign(useLocaleStore.getInitialState(), { gender: 'other' });
});

it('default CTA', async () => {
  await expect(html(<SuggestionCard suggestion={suggestion} onStart={() => {}} />)).toMatchFileSnapshot(snap('default'));
});
it('custom CTA', async () => {
  await expect(html(<SuggestionCard suggestion={suggestion} onStart={() => {}} ctaLabel="צפה במסלול" />)).toMatchFileSnapshot(snap('custom'));
});
it('starting', async () => {
  await expect(html(<SuggestionCard suggestion={suggestion} onStart={() => {}} isStarting />)).toMatchFileSnapshot(snap('starting'));
});
