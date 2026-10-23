/**
 * Entry flow v2 — the landing + the 5-barrier intro stories (enable_entry_intro_v1).
 * Copy (verbatim from the owner's design canvas, intro-S1/SB/S2–S6/G1, brief E) lives in the
 * `onboarding` catalog under `intro.*`; the builders below take a translator. The rest is plain
 * per-story data the screens are driven by. No React.
 */

import type { NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import type { onboarding } from '@/messages/ns/onboarding';

/** The deck's five tones, top segment first, clockwise (website BarrierRing TONES). */
export const RING_TONES = ['#4fb3ea', '#52c3e0', '#55cfd9', '#5ddcd4', '#67e6d3'] as const;
/** An un-lit ring segment. */
export const RING_GREY = '#e2e8f0';

export const INTRO_IMG = '/images/intro';

/** A translator bound to the `onboarding` namespace (useT / makeT / getT). */
export type IntroT = (key: NamespaceKey<typeof onboarding>, values?: MessageValues) => string;

export function landingCopy(t: IntroT) {
  return {
    titlePre: t('intro.landing.titlePre'),
    sub: t('intro.landing.sub'),
    cityAlt: t('intro.landing.cityAlt'),
    cta: t('intro.landing.cta'),
    login: t('intro.landing.login'),
  } as const;
}

export function bridgeCopy(t: IntroT) {
  return {
    eyebrow: t('intro.bridge.eyebrow'),
    titleLines: [t('intro.bridge.title1'), t('intro.bridge.title2')],
    lead: t('intro.bridge.lead'),
    closingLines: [t('intro.bridge.closing1'), t('intro.bridge.closing2')],
    cta: t('intro.bridge.cta'),
  } as const;
}

export function introUi(t: IntroT) {
  return {
    next: t('intro.ui.next'),
    skip: t('intro.ui.skip'),
    of: (i: number, total: number) => t('intro.ui.of', { i: String(i), total: String(total) }),
    pushApp: 'OUT', // brand name
    pushNow: t('intro.ui.pushNow'),
  } as const;
}

export type StorySide = 'left' | 'right';

export type BarrierId = 'alon' | 'michal' | 'dani' | 'omer' | 'ruti';

/** The non-copy half of a story: ids, assets, side, lock-screen clock (24h, data). */
export interface BarrierStoryMeta {
  /** Stable id — also the asset suffix (sad-{id}.jpg, happy-{id}.png) and the catalog key segment. */
  id: BarrierId;
  /** The in-phone app screen asset (phone-{phone}.jpg). */
  phone: 'time' | 'community' | 'access' | 'money' | 'knowledge';
  side: StorySide;
  clock: string;
}

export interface BarrierStory extends BarrierStoryMeta {
  /** The barrier's name — the ring label and the header badge. */
  barrier: string;
  /** Name + age line under the character. */
  person: string;
  thought: string;
  push: string;
  titleLines: readonly [string, string];
  sub: string;
}

/** The five stories' structure, in ring order (clockwise from the top). Copy: `barrierStories(t)`. */
export const BARRIER_STORY_META: readonly BarrierStoryMeta[] = [
  { id: 'alon', phone: 'time', side: 'left', clock: '07:40' },
  { id: 'michal', phone: 'community', side: 'right', clock: '18:20' },
  { id: 'dani', phone: 'access', side: 'left', clock: '16:40' },
  { id: 'omer', phone: 'money', side: 'left', clock: '17:30' },
  { id: 'ruti', phone: 'knowledge', side: 'right', clock: '08:15' },
] as const;

/** The five stories with their copy, in ring order. */
export function barrierStories(t: IntroT): readonly BarrierStory[] {
  return BARRIER_STORY_META.map((m) => ({
    id: m.id,
    barrier: t(`intro.story.${m.id}.barrier`),
    phone: m.phone,
    person: t(`intro.story.${m.id}.person`),
    side: m.side,
    thought: t(`intro.story.${m.id}.thought`),
    push: t(`intro.story.${m.id}.push`),
    clock: m.clock,
    titleLines: [t(`intro.story.${m.id}.title1`), t(`intro.story.${m.id}.title2`)] as const,
    sub: t(`intro.story.${m.id}.sub`),
  }));
}

export function barrierLabels(t: IntroT): readonly string[] {
  return barrierStories(t).map((s) => s.barrier);
}

/** Every image a story screen shows — preloaded one screen ahead. */
export function storyImages(story: Pick<BarrierStoryMeta, 'id' | 'phone'>): string[] {
  return [
    `${INTRO_IMG}/sad-${story.id}.jpg`,
    `${INTRO_IMG}/happy-${story.id}.png`,
    `${INTRO_IMG}/phone-${story.phone}.jpg`,
  ];
}
