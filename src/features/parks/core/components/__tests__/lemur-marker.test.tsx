// @vitest-environment jsdom
/**
 * Map-tab lemur delay (23.10.2026): the user's map marker must use the small
 * marker-sized art (not the 1587x2245 multi-MB artwork), show a placeholder
 * until it loads, and the preload must request each image only once per session.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

vi.mock('@/lib/firebase', () => ({ auth: {}, db: {} }));

import { PERSONA_IMAGES, DEFAULT_LEMUR_IMAGE, resolvePersonaImage } from '@/features/parks/core/hooks/useGroupPresence';
import {
  LEMUR_MARKER_IMAGES,
  resolvePersonaMarkerImage,
  preloadLemurMarkerImages,
  __resetLemurMarkerCacheForTests,
  __lemurMarkerCacheSizeForTests,
} from '@/features/parks/core/lib/lemurMarkerImages';
import LemurMarker from '@/features/parks/core/components/LemurMarker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('resolvePersonaMarkerImage', () => {
  it('picks the same character as resolvePersonaImage, marker-sized', () => {
    for (const id of [...Object.keys(PERSONA_IMAGES), 'unknown', null, undefined]) {
      const full = resolvePersonaImage(id);
      expect(resolvePersonaMarkerImage(id)).toBe(LEMUR_MARKER_IMAGES[full]);
    }
    expect(resolvePersonaMarkerImage(null)).toBe(LEMUR_MARKER_IMAGES[DEFAULT_LEMUR_IMAGE]);
  });

  it('every marker image exists in public/ and is small (< 100 KB)', () => {
    for (const src of Object.values(LEMUR_MARKER_IMAGES)) {
      const file = path.join(process.cwd(), 'public', src);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.statSync(file).size).toBeLessThan(100 * 1024);
    }
  });
});

describe('preloadLemurMarkerImages', () => {
  let created: string[];
  const RealImage = globalThis.Image;
  beforeEach(() => {
    __resetLemurMarkerCacheForTests();
    created = [];
    globalThis.Image = class FakeImage {
      decoding = '';
      complete = false;
      naturalWidth = 0;
      private s = '';
      set src(v: string) { created.push(v); this.s = v; }
      get src() { return this.s; }
      decode() { return Promise.resolve(); }
    } as unknown as typeof Image;
  });
  afterEach(() => { globalThis.Image = RealImage; });

  it('requests each marker image once, however many times the map mounts', () => {
    preloadLemurMarkerImages();
    preloadLemurMarkerImages();
    preloadLemurMarkerImages();
    const unique = new Set(Object.values(LEMUR_MARKER_IMAGES));
    expect(created.sort()).toEqual(Array.from(unique).sort());
    expect(__lemurMarkerCacheSizeForTests()).toBe(unique.size);
  });
});

describe('<LemurMarker>', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    __resetLemurMarkerCacheForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('renders the marker-sized art, never the full artwork', () => {
    const html = renderToStaticMarkup(<LemurMarker size={52} personaId="parent" />);
    expect(html).toContain('/assets/lemur/marker/lemur-avatar-156-v1.png');
    expect(html).not.toContain('/assets/lemur/lemur-avatar.png');
    expect(html).not.toContain('/assets/lemur/king-lemur.png');
  });

  it('shows the placeholder until the image loads, then the unchanged look', () => {
    act(() => { root.render(<LemurMarker size={52} />); });
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/assets/lemur/marker/king-lemur-156-v1.png');
    expect(img.dataset.loaded).toBe('false');
    expect(img.style.background).not.toBe('');

    act(() => { img.dispatchEvent(new Event('load')); });
    expect(img.dataset.loaded).toBe('true');
    expect(img.style.background).toBe('');
  });

  it('keeps one <img> element across re-renders (no remount/re-request)', () => {
    act(() => { root.render(<LemurMarker size={52} personaId="parent" />); });
    const first = container.querySelector('img');
    act(() => { root.render(<LemurMarker size={52} personaId="parent" />); });
    expect(container.querySelector('img')).toBe(first);
  });
});
