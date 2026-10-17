import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import HybridStationCta from '../HybridStationCta';

// Design-v2 polish (wave 3): the hybrid station buttons carry lucide icons in a v2 IconTile,
// never emoji (same move the guided layer made in #312). Rendered for real (node env,
// .ts + createElement — see ui/v2's render tests) plus a source scan of the layer's buttons.

// RegExp constructor (not a /u literal): the repo's tsc target predates the `u` flag in literals.
const EMOJI = new RegExp('[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{1F000}-\\u{1F2FF}\\u{FE0F}]', 'u');
const noop = () => {};

describe('HybridStationCta — no emoji, v2 icon tile', () => {
  it.each([
    [false, 'הגעתי לתחנה'],
    [true, 'סיים אימון משולב'],
  ])('isFinalLeg=%s renders "%s" with an IconTile and no emoji', (isFinalLeg, label) => {
    const html = renderToStaticMarkup(createElement(HybridStationCta, { isFinalLeg, onClick: noop }));
    expect(html).toContain(label);
    expect(html).toContain('data-v2-icon-tile="dark"');
    expect(html).toContain('<svg');
    expect(html).not.toMatch(EMOJI);
  });
});

describe('HybridStationLayer — station buttons carry no emoji', () => {
  const layer = readFileSync(fileURLToPath(new URL('../HybridStationLayer.tsx', import.meta.url)), 'utf8');

  it('renders the CTA through HybridStationCta', () => {
    expect(layer).toContain('<HybridStationCta');
  });

  it('no <button> element in the layer has emoji in its contents', () => {
    const buttons = layer.match(/<button[\s\S]*?<\/button>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(3); // skip (station), skip (approach), walking-card "הגעתי"
    // Code comments may mention old glyphs (e.g. the historical "✕") — only rendered text counts.
    for (const b of buttons) expect(b.replace(/\/\/.*$/gm, '')).not.toMatch(EMOJI);
  });
});
