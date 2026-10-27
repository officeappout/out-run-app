/**
 * i18n batch av (namespace `profile`, keys achievements.* / levelStage.* / stageTitle.*): progression components.
 * Snapshots recorded BEFORE the extraction from unmodified origin/main; `<!-- -->` stripped before comparing.
 * The initial state of the zustand stores is written into getInitialState() (react-dom/server reads it).
 */
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: false } }) }));
vi.mock('@/features/user/progression/hooks/useLevelConfig', () => ({
  useLevelConfig: () => ({
    getEntry: () => ({ maxXP: 100_000 }),
    getNextThreshold: () => 800,
    calcProgress: () => 40,
  }),
}));

import { BadgeDisplay } from '../BadgeDisplay';
import { AchievementUnlockToast } from '../AchievementUnlockToast';
import { AchievementSheet } from '../AchievementSheet';
import { IdentityHeroCard } from '../IdentityHeroCard';
import { ACHIEVEMENT_DEFINITIONS } from '../../config/achievement-definitions';
import { useLocaleStore } from '@/store/useLocaleStore';
import { useProgressionStore } from '../../store/useProgressionStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/progression-av-i18n/${name}.html`;
const noop = () => {};

const oneTime = ACHIEVEMENT_DEFINITIONS.find((d) => d.type === 'one_time')!;
const tiered = ACHIEVEMENT_DEFINITIONS.find((d) => d.type === 'tiered')!;
const entry = { unlockedAt: 1 } as never;
const unlocked = { [oneTime.id]: entry, [`${tiered.id}_bronze`]: entry, [`${tiered.id}_silver`]: entry };

const PROGRESSION_DEFAULTS = { ...useProgressionStore.getInitialState() };
beforeEach(() => {
  Object.assign(useLocaleStore.getInitialState(), { gender: 'other' });
  Object.assign(useProgressionStore.getInitialState(), PROGRESSION_DEFAULTS);
});
afterAll(() => vi.restoreAllMocks());

const genders = ['male', 'female', 'other'] as const;

it.each(genders)('BadgeDisplay, %s', async (gender) => {
  Object.assign(useLocaleStore.getInitialState(), { gender });
  const out = [
    html(<BadgeDisplay unlockedAchievements={{}} onViewAll={noop} />),
    html(<BadgeDisplay unlockedAchievements={{}} onViewAll={noop} v2 />),
    html(<BadgeDisplay unlockedAchievements={unlocked} onViewAll={noop} />),
    html(<BadgeDisplay unlockedAchievements={unlocked} onViewAll={noop} maxVisible={1} />),
    html(<BadgeDisplay unlockedAchievements={unlocked} onViewAll={noop} v2 maxVisible={2} />),
    html(<BadgeDisplay unlockedAchievements={unlocked} onViewAll={noop} v2 />),
  ].join('\n\n');
  await expect(out).toMatchFileSnapshot(snap(`badge-display-${gender}`));
});

it.each(genders)('AchievementUnlockToast, %s', async (gender) => {
  Object.assign(useLocaleStore.getInitialState(), { gender });
  const out = [
    html(<AchievementUnlockToast item={null} onDismiss={noop} />),
    html(<AchievementUnlockToast item={{ achievement: oneTime, xpAwarded: 100 }} onDismiss={noop} />),
    html(<AchievementUnlockToast item={{ achievement: tiered, tier: 'gold', xpAwarded: 300 }} onDismiss={noop} />),
  ].join('\n\n');
  await expect(out).toMatchFileSnapshot(snap(`toast-${gender}`));
});

it.each(genders)('AchievementSheet, %s', async (gender) => {
  Object.assign(useLocaleStore.getInitialState(), { gender });
  const out = [
    html(<AchievementSheet isOpen onClose={noop} unlockedAchievements={{}} />),
    html(<AchievementSheet isOpen onClose={noop} unlockedAchievements={unlocked} />),
    html(<AchievementSheet isOpen v2 onClose={noop} unlockedAchievements={unlocked} />),
  ].join('\n\n');
  await expect(out).toMatchFileSnapshot(snap(`sheet-${gender}`));
});

it.each(genders)('IdentityHeroCard, %s', async (gender) => {
  Object.assign(useUserStore.getInitialState(), { profile: { id: 'u1', core: { gender } } });
  const states = [
    { isHydrated: false, globalLevel: 1, globalXP: 0, currentStreak: 0 },
    { isHydrated: true, globalLevel: 3, globalXP: 1234, currentStreak: 5 },
    { isHydrated: true, globalLevel: 10, globalXP: 120_000, currentStreak: 40 },
  ];
  const out = states.map((s) => {
    Object.assign(useProgressionStore.getInitialState(), s);
    return html(<IdentityHeroCard />);
  }).join('\n\n');
  Object.assign(useUserStore.getInitialState(), { profile: null });
  await expect(out).toMatchFileSnapshot(snap(`identity-hero-${gender}`));
});
