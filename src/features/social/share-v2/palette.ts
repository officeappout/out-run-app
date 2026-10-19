/**
 * Colours per background tone — the text colour flips with the background
 * (photo / night / navy → white ink; OUT cyan → deep ink; clean → dark ink).
 * Pure. A future sticker set adds its ink variants (white / dark / OUT) as
 * more tones here.
 */
import type { BrandStyle, ShareBackground, ShareInk, ShareKind, ShareTone } from './types';

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
  /** Stickers: a soft shadow under everything so it reads on any photo. */
  shadow?: string;
}

export const CYAN: [string, string] = ['#00baf7', '#0cf2e3'];
export const LIME: [string, string] = ['#84cc16', '#0cf2e3'];

export function toneFor(bg: ShareBackground, brand: BrandStyle, ink: ShareInk = 'white'): ShareTone {
  if (bg === 'none') return `ink-${ink}`;
  if (bg === 'photo') return 'dark';
  if (bg === 'plain') return 'light';
  return brand === 'cyan' ? 'cyan' : 'dark';
}

/** Transparent stickers: one ink colour for everything + a shadow. */
function inkPalette(tone: 'ink-white' | 'ink-dark' | 'ink-brand'): SharePalette {
  const ink = tone === 'ink-white' ? '#ffffff' : tone === 'ink-dark' ? '#0e1419' : '#00baf7';
  const sub = tone === 'ink-white' ? 'rgba(255,255,255,0.88)' : tone === 'ink-dark' ? '#2b3a45' : '#0284c7';
  return {
    tone,
    fg: ink,
    sub,
    accentText: sub,
    hairline: tone === 'ink-white' ? 'rgba(255,255,255,0.7)' : tone === 'ink-dark' ? 'rgba(14,20,25,0.45)' : 'rgba(0,186,247,0.55)',
    chipBg: 'transparent',
    chipRing: 'transparent',
    boxFill: CYAN,
    boxText: '#04222b',
    emptyRing: sub,
    emptyText: sub,
    ringTrack: tone === 'ink-white' ? 'rgba(255,255,255,0.35)' : tone === 'ink-dark' ? 'rgba(14,20,25,0.18)' : 'rgba(0,186,247,0.22)',
    logoO: 'grad',
    logoInk: tone === 'ink-brand' ? '#00baf7' : ink,
    routeInk: tone === 'ink-white' ? 'white' : 'gradient',
    streakText: ink,
    panelBg: 'transparent',
    panelRing: 'transparent',
    shadow: tone === 'ink-dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.38)',
  };
}

export function paletteFor(tone: ShareTone, kind: ShareKind): SharePalette {
  if (tone === 'ink-white' || tone === 'ink-dark' || tone === 'ink-brand') return inkPalette(tone);
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
