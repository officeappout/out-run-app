/**
 * MediaHeroFade — the full-bleed hero that fades into the surface below
 * (no card, no grey placeholder). Static markup + pure helpers.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MediaHeroFade,
  MEDIA_HERO_BRAND_FILL,
  MEDIA_HERO_FADE_MASK,
  heroMaskStyle,
  pickHeroMedia,
} from '../index';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('pickHeroMedia', () => {
  it('video first, then image, else none', () => {
    expect(pickHeroMedia({ videoUrl: 'v.mp4', imageUrl: 'p.jpg' })).toEqual({ kind: 'video', src: 'v.mp4', poster: 'p.jpg', position: undefined });
    expect(pickHeroMedia({ imageUrl: ' p.jpg ', alt: 'a' })).toEqual({ kind: 'image', src: 'p.jpg', alt: 'a', position: undefined });
    expect(pickHeroMedia({ videoUrl: '', imageUrl: null })).toEqual({ kind: 'none' });
  });
});

describe('heroMaskStyle', () => {
  it('full uses the workout preview drawer stops; short only fades the last 28px', () => {
    expect(MEDIA_HERO_FADE_MASK.full).toContain('rgba(255,255,255,0) 13%');
    expect(MEDIA_HERO_FADE_MASK.full).toContain('rgba(255,255,255,1) 85%');
    expect(MEDIA_HERO_FADE_MASK.short).toContain('rgba(255,255,255,1) 28px');
    const s = heroMaskStyle('full');
    expect(s.maskImage).toBe(MEDIA_HERO_FADE_MASK.full);
    expect(s.WebkitMaskImage).toBe(MEDIA_HERO_FADE_MASK.full);
  });
});

describe('MediaHeroFade', () => {
  it('no media → brand gradient over the fade colour, no card styling, no icon', () => {
    const out = html(<MediaHeroFade height={240} fadeTo="#f6fbfd" />);
    expect(out).toContain('data-v2-media-hero="full"');
    expect(out).toContain('background:#f6fbfd');
    expect(out).toContain('height:240px');
    expect(out).toContain(`background:${MEDIA_HERO_BRAND_FILL}`);
    expect(out).toContain('mask-image:linear-gradient(to top');
    expect(out).toContain('from-black/25'); // top shade
    expect(out).not.toMatch(/rounded|shadow-v2|<svg|<img/);
  });

  it('image → fades in once loaded (starts hidden), position + zoom applied', () => {
    const out = html(<MediaHeroFade media={{ kind: 'image', src: '/a.jpg', alt: 'x', position: '50% 20%', zoom: 1.2 }} />);
    expect(out).toContain('src="/a.jpg"');
    expect(out).toContain('alt="x"');
    expect(out).toContain('opacity:0');
    expect(out).toContain('object-position:50% 20%');
    expect(out).toContain('scale(1.2)');
  });

  it('video → muted inline loop with poster', () => {
    const out = html(<MediaHeroFade media={{ kind: 'video', src: '/v.mp4', poster: '/p.jpg' }} />);
    expect(out).toMatch(/<video[^>]*src="\/v.mp4"/);
    expect(out).toContain('poster="/p.jpg"');
    expect(out).toContain('playsinline');
    expect(out).toMatch(/muted/);
  });

  it('children replace media; overlay sits unmasked above; topShade/fade options', () => {
    const out = html(
      <MediaHeroFade media={{ kind: 'image', src: '/ignored.jpg' }} fade="short" topShade={false} overlay={<b>over</b>}>
        <i>custom</i>
      </MediaHeroFade>,
    );
    expect(out).toContain('<i>custom</i>');
    expect(out).not.toContain('/ignored.jpg');
    expect(out).toContain('data-v2-media-hero="short"');
    expect(out).not.toContain('from-black/25');
    expect(out).toContain('pointer-events-none absolute inset-0"><b>over</b>');
  });
});
