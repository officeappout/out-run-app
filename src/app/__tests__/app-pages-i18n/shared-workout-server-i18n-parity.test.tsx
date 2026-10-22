/**
 * i18n wave 2 batch ab (namespace `library`, prefix `sharedWorkout.*`): the shared-workout web page's
 * server output — `generateMetadata()` (title / description / OG / Twitter tags that WhatsApp / Instagram /
 * Twitter crawlers read) and the OG image (`opengraph-image.tsx`, edge). Snapshots recorded BEFORE the
 * extraction, from unmodified origin/main.
 *
 * The metadata is snapshotted as JSON; the OG image's JSX is captured from a mocked `next/og`
 * ImageResponse and rendered with react-dom/server (node env). `<!-- -->` is stripped before comparing
 * (react-dom/server's separator between adjacent text nodes; not rendered text).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const S = vi.hoisted(() => ({ meta: null as unknown, captured: null as unknown }));

vi.mock('@/app/workouts/[id]/shared-workout-loader', () => ({ fetchSharedWorkoutMeta: async () => S.meta }));
vi.mock('@/app/workouts/[id]/WorkoutPreviewClient', () => ({ default: () => null }));
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(el: unknown) {
      S.captured = el;
    }
  },
}));

import { generateMetadata } from '@/app/workouts/[id]/page';
import OGImage from '@/app/workouts/[id]/opengraph-image';

const snapJson = (name: string) => `./__snapshots__/shared-workout/${name}.json`;
const snapHtml = (name: string) => `./__snapshots__/shared-workout/${name}.html`;
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');

const META = {
  title: 'אימון הבוקר',
  description: '',
  difficulty: 2,
  estimatedDuration: 35,
  exerciseCount: 8,
  muscles: ['chest', 'back', 'neck', 'full_body', 'abs'],
  equipment: [],
  structure: 'standard',
};

beforeEach(() => {
  S.meta = null;
  S.captured = null;
});

describe('/workouts/[id] — generateMetadata', () => {
  it('no shared doc', async () => {
    const m = await generateMetadata({ params: { id: 'w1' } });
    await expect(JSON.stringify(m, null, 2)).toMatchFileSnapshot(snapJson('metadata-missing'));
  });

  it.each([1, 2, 3, 0, 7, 2.5])('shared doc, difficulty %s', async (difficulty) => {
    S.meta = { ...META, difficulty, estimatedDuration: difficulty === 7 ? 1500 : 35 };
    const m = await generateMetadata({ params: { id: 'w1' } });
    await expect(JSON.stringify(m, null, 2)).toMatchFileSnapshot(snapJson(`metadata-d${difficulty}`));
  });
});

describe('/workouts/[id] — OG image', () => {
  it('no shared doc', async () => {
    await OGImage({ params: { id: 'w1' } });
    await expect(html(S.captured as ReactElement)).toMatchFileSnapshot(snapHtml('og-missing'));
  });

  it.each([1, 2, 3, 9])('shared doc, difficulty %s', async (difficulty) => {
    S.meta = { ...META, difficulty };
    await OGImage({ params: { id: 'w1' } });
    await expect(html(S.captured as ReactElement)).toMatchFileSnapshot(snapHtml(`og-d${difficulty}`));
  });

  it('big counts, every muscle id, empty title', async () => {
    S.meta = {
      ...META,
      title: '',
      estimatedDuration: 1500,
      exerciseCount: 1234,
      muscles: ['triceps', 'core', 'quads', 'hamstrings'],
    };
    await OGImage({ params: { id: 'w1' } });
    const first = html(S.captured as ReactElement);
    const rest: string[] = [];
    for (const group of [
      ['glutes', 'calves', 'legs', 'forearms'],
      ['lats', 'upper_back', 'lower_back', 'obliques'],
      ['traps', 'hip_flexors', 'shoulders', 'biceps'],
    ]) {
      S.meta = { ...META, muscles: group };
      await OGImage({ params: { id: 'w1' } });
      rest.push(html(S.captured as ReactElement));
    }
    await expect([first, ...rest].join('\n')).toMatchFileSnapshot(snapHtml('og-all-muscles'));
  });

  it('zero duration / zero exercises / no muscles', async () => {
    S.meta = { ...META, estimatedDuration: 0, exerciseCount: 0, muscles: [] };
    await OGImage({ params: { id: 'w1' } });
    await expect(html(S.captured as ReactElement)).toMatchFileSnapshot(snapHtml('og-empty-stats'));
  });
});
