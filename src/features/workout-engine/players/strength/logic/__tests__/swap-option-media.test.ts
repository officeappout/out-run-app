/** S3 — a swap option's photo follows the workout's location (home / park). */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, db: {} }));

import { methodAtLocation, resolveSwapOptionImage } from '../swap-option-media';

const home = { location: 'home', media: { imageUrl: 'https://img/home.jpg' } };
const park = { location: 'park', media: { imageUrl: 'https://img/park.jpg' } };
const homeNoPhoto = { location: 'home', media: {} };

describe('resolveSwapOptionImage', () => {
  it('home workout → the home photo, even when the park method comes first', () => {
    expect(resolveSwapOptionImage({ execution_methods: [park, home] }, null, 'home')).toBe('https://img/home.jpg');
  });
  it('park workout → the park photo', () => {
    expect(resolveSwapOptionImage({ execution_methods: [home, park] }, home, 'park')).toBe('https://img/park.jpg');
  });
  it('chosen method at this location wins over another one at the same location', () => {
    const home2 = { location: 'home', media: { imageUrl: 'https://img/home2.jpg' } };
    expect(resolveSwapOptionImage({ execution_methods: [home, home2] }, home2, 'home')).toBe('https://img/home2.jpg');
  });
  it('locationMapping counts as this location', () => {
    const mapped = { location: 'office', locationMapping: ['home'], media: { imageUrl: 'https://img/m.jpg' } };
    expect(resolveSwapOptionImage({ execution_methods: [park, mapped] }, null, 'home')).toBe('https://img/m.jpg');
  });
  it('a video URL stored as the photo is skipped', () => {
    const bad = { location: 'home', media: { imageUrl: 'https://x/clip.mp4' } };
    const good = { location: 'home', media: { imageUrl: 'https://img/ok.jpg' } };
    expect(resolveSwapOptionImage({ execution_methods: [bad, good] }, bad, 'home')).toBe('https://img/ok.jpg');
  });
  it('no photo at this location → the home method\'s Bunny video frame before the park photo', () => {
    const bunnyHome = { location: 'home', media: { bunnyVideoId_mainVideoUrl: 'abc-123' } };
    const url = resolveSwapOptionImage({ execution_methods: [park, bunnyHome] }, null, 'home');
    expect(url).toContain('abc-123');
    expect(url).toContain('thumbnail');
  });
  it('nothing at this location → falls back to any media (today\'s behaviour)', () => {
    expect(resolveSwapOptionImage({ execution_methods: [park, homeNoPhoto] }, homeNoPhoto, 'home')).toBe('https://img/park.jpg');
  });
  it('no location → same as the shared resolver', () => {
    expect(resolveSwapOptionImage({ execution_methods: [home, park] }, home, null)).toBe('https://img/home.jpg');
  });
});

describe('methodAtLocation', () => {
  it('matches location or mapping, never without a location', () => {
    expect(methodAtLocation(home, 'home')).toBe(true);
    expect(methodAtLocation(park, 'home')).toBe(false);
    expect(methodAtLocation(home, null)).toBe(false);
    expect(methodAtLocation(null, 'home')).toBe(false);
  });
});
