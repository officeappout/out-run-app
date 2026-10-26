/**
 * i18n wave 2 batch ak (namespace `onboarding`, keys `intro.*`): the entry-flow copy and its screens.
 * Snapshots recorded BEFORE the extraction from unmodified origin/main: the whole copy object
 * (landing, bridge, UI words, five stories) and the static markup of every screen.
 * `<!-- -->` (react-dom/server's text-node separator) is stripped before comparing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { IntroLanding } from '../components/IntroLanding';
import { BarrierBridge } from '../components/BarrierBridge';
import { StoryScreen } from '../components/StoryScreen';
import { IntroFlow } from '../components/IntroFlow';
import { copySnapshot } from './copy-under-test';
import { storiesUnderTest } from './stories-under-test';

const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/intro-i18n/${name}`;

// The phone lock screens show today's date; the snapshots were recorded on Friday 23.10.2026.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-23T09:00:00+03:00'));
});
afterAll(() => {
  vi.useRealTimers();
});

describe('intro copy and screens', () => {
  it('copy objects', async () => {
    await expect(JSON.stringify(copySnapshot(), null, 2)).toMatchFileSnapshot(snap('copy.json'));
  });
  it('landing', async () => {
    await expect(html(<IntroLanding onQuickSignup={noop} onLogin={noop} />)).toMatchFileSnapshot(snap('landing.html'));
  });
  it('bridge', async () => {
    await expect(html(<BarrierBridge reduce={false} onNext={noop} onSkip={noop} />)).toMatchFileSnapshot(snap('bridge.html'));
  });
  it.each([0, 1, 2, 3, 4])('story %i', async (i) => {
    const s = storiesUnderTest()[i];
    await expect(html(<StoryScreen story={s} index={i} reduce={false} onNext={noop} onSkip={noop} />)).toMatchFileSnapshot(snap(`story-${i}.html`));
  });
  it('story, reduced motion', async () => {
    const s = storiesUnderTest()[1];
    await expect(html(<StoryScreen story={s} index={1} reduce onNext={noop} onSkip={noop} />)).toMatchFileSnapshot(snap('story-1-reduced.html'));
  });
  it('flow starts on the bridge', async () => {
    await expect(html(<IntroFlow onDone={noop} />)).toMatchFileSnapshot(snap('flow.html'));
  });
});
