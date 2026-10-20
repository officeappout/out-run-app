/**
 * SSR smoke render of the intro screens (node, no jsdom): every screen mounts,
 * shows its verbatim copy, and the story is driven by its data row.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BARRIER_STORIES, BRIDGE_COPY, LANDING_COPY } from '../intro-copy';
import { IntroLanding } from '../components/IntroLanding';
import { BarrierBridge } from '../components/BarrierBridge';
import { StoryScreen } from '../components/StoryScreen';
import { IntroFlow } from '../components/IntroFlow';

const noop = () => {};

describe('intro screens render', () => {
  it('landing: city, title with the logo, both entry points', () => {
    const html = renderToStaticMarkup(<IntroLanding onQuickSignup={noop} onLogin={noop} />);
    expect(html).toContain('/images/intro/city-portrait.jpg');
    expect(html).toContain(LANDING_COPY.titlePre);
    expect(html).toContain('/images/intro/logo-out.svg');
    expect(html).toContain(LANDING_COPY.cta);
    expect(html).toContain(LANDING_COPY.login);
  });

  it('bridge: copy + five ring labels + CTA', () => {
    const html = renderToStaticMarkup(<BarrierBridge reduce={false} onNext={noop} onSkip={noop} />);
    expect(html).toContain(BRIDGE_COPY.eyebrow);
    expect(html).toContain(BRIDGE_COPY.lead);
    for (const l of ['זמן', 'קהילה', 'נגישות', 'כסף', 'ידע']) expect(html).toContain(l);
    expect(html).toContain(BRIDGE_COPY.cta);
    expect(html).toContain('דלג');
  });

  it.each(BARRIER_STORIES.map((s, i) => [i, s] as const))('story %i renders its row', (i, s) => {
    const html = renderToStaticMarkup(
      <StoryScreen story={s} index={i} reduce={false} onNext={noop} onSkip={noop} />,
    );
    expect(html).toContain(s.titleLines[0]);
    expect(html).toContain(s.thought);
    expect(html).toContain(s.push);
    expect(html).toContain(s.clock);
    expect(html).toContain(`${i + 1} מתוך 5`);
    expect(html).toContain(`/images/intro/phone-${s.phone}.jpg`);
    expect(html).toContain(`/images/intro/sad-${s.id}.jpg`);
    expect(html).toContain('הבא');
  });

  it('reduced motion renders the same content', () => {
    const s = BARRIER_STORIES[1];
    const html = renderToStaticMarkup(<StoryScreen story={s} index={1} reduce onNext={noop} onSkip={noop} />);
    expect(html).toContain(s.push);
    expect(html).toContain(`/images/intro/happy-${s.id}.png`);
  });

  it('the flow starts on the bridge', () => {
    const html = renderToStaticMarkup(<IntroFlow onDone={noop} />);
    expect(html).toContain(BRIDGE_COPY.titleLines[0]);
  });
});
