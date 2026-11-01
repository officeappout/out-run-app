/**
 * Pilot AJ7 (enable_pilot_ah_v1): ShimmerPhraseButton's crossfade mode never leaves the pill
 * blank between phrases. Off → the original markup (no extra keyframes).
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ShimmerPhraseButton from '../ShimmerPhraseButton';

const noop = () => {};
const msgs = ['א', 'ב', 'ג'];

describe('ShimmerPhraseButton crossfade', () => {
  it('off: no crossfade keyframes, one faded phrase span', () => {
    const html = renderToStaticMarkup(<ShimmerPhraseButton messages={msgs} onTap={noop} />);
    expect(html).not.toContain('phraseIn');
    expect(html).toContain('opacity:1');
  });

  it('on: the first phrase shows at full opacity, no fade-out span yet', () => {
    const html = renderToStaticMarkup(<ShimmerPhraseButton messages={msgs} onTap={noop} crossfade />);
    expect(html).toContain('@keyframes phraseIn');
    expect(html).not.toContain('phraseOut 0.35s');
    expect(html).toContain('>א</span>');
  });

  it('on with a single phrase: the plain span (nothing to rotate)', () => {
    const html = renderToStaticMarkup(<ShimmerPhraseButton messages={['א']} onTap={noop} crossfade />);
    expect(html).not.toContain('grid-area');
  });
});
