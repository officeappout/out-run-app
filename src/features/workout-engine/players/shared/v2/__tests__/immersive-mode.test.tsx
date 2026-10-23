import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, db: {} }));

import { decidePlayerMode, isAmbientColumn, videoAspect, type PlayerModeInput } from '../immersive-mode';
import AmbientMedia from '../AmbientMedia';
import ImmersiveOverlay from '../../../strength/components/ImmersiveOverlay';

describe('videoAspect', () => {
  it('classifies by shape; unknown until measured', () => {
    expect(videoAspect(1920, 1080)).toBe('landscape');
    expect(videoAspect(1080, 1920)).toBe('portrait');
    expect(videoAspect(1000, 1000)).toBe('portrait');
    expect(videoAspect(0, 0)).toBeNull();
  });
});

describe('decidePlayerMode (video aspect × orientation × flag)', () => {
  const base: PlayerModeInput = { enabled: true, wide: true, landscape: true, aspect: null, userImmersive: false };
  it('flag off → always default', () => {
    for (const aspect of ['landscape', 'portrait', null] as const)
      expect(decidePlayerMode({ ...base, enabled: false, aspect })).toBe('default');
  });
  it('landscape clip on a landscape screen → immersive', () => {
    expect(decidePlayerMode({ ...base, aspect: 'landscape' })).toBe('immersive');
  });
  it('landscape clip on a portrait phone → default, unless the user chose full screen', () => {
    const portrait = { ...base, wide: false, landscape: false, aspect: 'landscape' as const };
    expect(decidePlayerMode(portrait)).toBe('default');
    expect(decidePlayerMode({ ...portrait, userImmersive: true })).toBe('immersive');
  });
  it('portrait / unknown clip on a wide screen → split (never immersive)', () => {
    expect(decidePlayerMode({ ...base, aspect: 'portrait' })).toBe('split');
    expect(decidePlayerMode({ ...base, aspect: null })).toBe('split');
    expect(decidePlayerMode({ ...base, aspect: 'portrait', userImmersive: true })).toBe('split');
  });
  it('portrait clip on a portrait phone → default', () => {
    expect(decidePlayerMode({ ...base, wide: false, landscape: false, aspect: 'portrait' })).toBe('default');
  });
  it('rotating back restores: same inputs minus landscape → default again', () => {
    const rotated = { ...base, aspect: 'landscape' as const };
    expect(decidePlayerMode(rotated)).toBe('immersive');
    expect(decidePlayerMode({ ...rotated, landscape: false, wide: false })).toBe('default');
  });
});

describe('AmbientMedia', () => {
  it('portrait → narrow column over a blurred poster; same child in both states', () => {
    const on = renderToStaticMarkup(<AmbientMedia posterUrl="/p.jpg" column><i id="v" /></AmbientMedia>);
    expect(isAmbientColumn('portrait')).toBe(true);
    expect(on).toContain('data-ambient-fill');
    expect(on).toContain('blur(40px)');
    expect(on).toContain('aspect-ratio:9 / 16');
    expect(on).toContain('id="v"');
    const off = renderToStaticMarkup(<AmbientMedia posterUrl="/p.jpg" column={false}><i id="v" /></AmbientMedia>);
    expect(isAmbientColumn(null)).toBe(false);
    expect(off).not.toContain('data-ambient-fill');
    expect(off).toContain('id="v"');
  });
  it('no poster → no fill', () => {
    expect(renderToStaticMarkup(<AmbientMedia column><i /></AmbientMedia>)).not.toContain('data-ambient-fill');
  });
});

describe('ImmersiveOverlay', () => {
  it('only the minimal chrome: name, target, done, minimize; exit only when offered', () => {
    const html = renderToStaticMarkup(
      <ImmersiveOverlay exerciseName="התאוששות" targetText="30 שניות" onDone={() => {}} onMinimize={() => {}} />,
    );
    for (const s of ['התאוששות', '30 שניות', 'סיימתי סט', 'מזעור', 'data-immersive']) expect(html).toContain(s);
    expect(html).not.toContain('יציאה ממסך מלא</span>');
    expect(html).toContain('safe-area-inset');
    const withExit = renderToStaticMarkup(<ImmersiveOverlay exerciseName="x" targetText="" onExit={() => {}} />);
    expect(withExit).toContain('יציאה ממסך מלא');
    expect(withExit).not.toContain('סיימתי סט');
  });
});
