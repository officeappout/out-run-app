/**
 * Colours per background tone — the text colour flips with the background
 * (photo / night / navy → white ink; OUT cyan → deep ink; clean → dark ink).
 * Pure. A future sticker set adds its ink variants (white / dark / OUT) as
 * more tones here.
 */
import type { BrandStyle, ShareBackground, ShareKind, ShareTone } from './types';

export interface SharePalette {
  tone: ShareTone;
  fg: string;
  sub: string;
  /** Eyebrow / chip text. */
  accentText: string;
  hairline: string;
  chipBg: string;
  chipRing: string;
  /** Set boxes: done fill (gradient stops) + text, empty ring + text. */
  boxFill: [string, string];
  boxText: string;
  emptyRing: string;
  emptyText: string;
  ringTrack: string;
  /** Logo: the O ring ('grad' = brand gradient) and the U/T letters. */
  logoO: 'grad' | string;
  logoInk: string;
  /** Route line on this background. */
  routeInk: 'white' | 'gradient';
  streakText: string;
  /** Pace-split panel. */
  panelBg: string;
  panelRing: string;
}

export const CYAN: [string, string] = ['#00baf7', '#0cf2e3'];
export const LIME: [string, string] = ['#84cc16', '#0cf2e3'];

export function toneFor(bg: ShareBackground, brand: BrandStyle): ShareTone {
  if (bg === 'photo') return 'dark';
  if (bg === 'plain') return 'light';
  return brand === 'cyan' ? 'cyan' : 'dark';
}

export function paletteFor(tone: ShareTone, kind: ShareKind): SharePalette {
  const run = kind === 'cardio';
  if (tone === 'cyan') {
    return {
      tone,
      fg: '#04222b',
      sub: '#04405c',
      accentText: '#04405c',
      hairline: 'rgba(4,34,43,0.22)',
      chipBg: 'rgba(255,255,255,0.35)',
      chipRing: 'rgba(255,255,255,0.7)',
      boxFill: ['#ffffff', '#ffffff'],
      boxText: '#04222b',
      emptyRing: 'rgba(4,34,43,0.35)',
      emptyText: '#04405c',
      ringTrack: 'rgba(255,255,255,0.45)',
      logoO: '#ffffff',
      logoInk: '#ffffff',
      routeInk: 'white',
      streakText: '#04222b',
      panelBg: 'rgba(255,255,255,0.3)',
      panelRing: 'rgba(255,255,255,0.5)',
    };
  }
  if (tone === 'light') {
    return {
      tone,
      fg: '#0e1419',
      sub: '#4b5a66',
      accentText: run ? '#4d7c0f' : '#0284c7',
      hairline: run ? '#e3ead8' : '#e3edf3',
      chipBg: run ? 'rgba(132,204,22,0.16)' : 'rgba(0,186,247,0.12)',
      chipRing: run ? 'rgba(101,163,13,0.45)' : 'rgba(0,186,247,0.45)',
      boxFill: CYAN,
      boxText: '#04222b',
      emptyRing: 'rgba(2,132,199,0.35)',
      emptyText: '#7aa9c2',
      ringTrack: '#e3f3fa',
      logoO: 'grad',
      logoInk: '#00baf7',
      routeInk: 'gradient',
      streakText: '#c2410c',
      panelBg: run ? '#f2fae6' : '#f1f9fd',
      panelRing: 'rgba(14,27,42,0.06)',
    };
  }
  return {
    tone,
    fg: '#ffffff',
    sub: 'rgba(255,255,255,0.72)',
    accentText: run ? '#a3e635' : '#7fe6ff',
    hairline: 'rgba(255,255,255,0.22)',
    chipBg: run ? 'rgba(132,204,22,0.28)' : 'rgba(0,186,247,0.28)',
    chipRing: run ? 'rgba(163,230,53,0.7)' : 'rgba(12,242,227,0.6)',
    boxFill: CYAN,
    boxText: '#04222b',
    emptyRing: 'rgba(255,255,255,0.45)',
    emptyText: 'rgba(255,255,255,0.6)',
    ringTrack: 'rgba(255,255,255,0.22)',
    logoO: 'grad',
    logoInk: '#ffffff',
    routeInk: 'white',
    streakText: '#fdba74',
    panelBg: 'rgba(255,255,255,0.07)',
    panelRing: 'rgba(255,255,255,0.1)',
  };
}
