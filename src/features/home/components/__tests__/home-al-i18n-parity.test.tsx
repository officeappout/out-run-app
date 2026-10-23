/**
 * i18n wave 2 batch al (namespace `home`): the small home components — CalmReturnCard, RunCatchUpNotice,
 * StreakNoticeView (+ streak-notice.ts copy), FirstWeekCard, GhostUpsell, ProcessingOverlay, RunWeekListV2,
 * RunReturnDrawer.
 *
 * The snapshots below were recorded from the components BEFORE the extraction; the extracted components must
 * render the same Hebrew markup in every state reached here. Static markup (react-dom/server, node env).
 * Zustand stores render their INITIAL state under react-dom/server, so state is written into getInitialState().
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text nodes; not rendered
 * text). The v2 Sheet portals to document.body, so RunReturnDrawer is rendered through an inline Sheet stub.
 * Branches a render can't reach are pinned key by key in src/lib/i18n/__tests__/home-al-he.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {}, storage: {} }));
vi.mock('next/navigation', () => {
  const router = { push() {}, replace() {} };
  return { useRouter: () => router };
});
vi.mock('@/components/ui/v2/Sheet', () => ({
  default: (p: { open: boolean; title?: ReactNode; children?: ReactNode }) =>
    p.open ? (
      <section data-sheet="">
        <h2>{p.title}</h2>
        {p.children}
      </section>
    ) : null,
}));
vi.mock('@/features/workout-engine/players/running/components/preview-v2/useRunPreviewModel', () => ({
  useRunPreviewModel: () => null,
}));

import { useLocaleStore } from '@/store/useLocaleStore';
import CalmReturnCard from '../CalmReturnCard';
import RunCatchUpNotice from '../run-return/RunCatchUpNotice';
import RunReturnDrawer from '../run-return/RunReturnDrawer';
import { StreakNoticeView } from '../streak/StreakNoticeCard';
import { noticeCard, pickStreakCard } from '../streak/streak-notice';
import FirstWeekCard, { firstWeekChipLabel } from '../first-week/FirstWeekCard';
import { GhostUpsell } from '../rows/GhostUpsell';
import ProcessingOverlay from '../ProcessingOverlay';
import RunWeekListV2 from '../widgets/run-week-v2/RunWeekListV2';
import { topUpTitleHe } from '../../utils/strength-top-up';

const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/home-al-i18n/${name}${name.includes('.') ? '' : '.html'}`;
const noop = () => {};
const T = '2026-10-21';

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS);
});

describe('dismissible cards', () => {
  it.each([
    ['male', true],
    ['female', false],
  ] as const)('CalmReturnCard %s, levelCheck=%s', async (gender, link) => {
    await expect(
      html(<CalmReturnCard gender={gender} showLevelCheckLink={link} onLevelCheck={noop} onDismiss={noop} />),
    ).toMatchFileSnapshot(snap(`calm-return-${gender}`));
  });

  it('RunCatchUpNotice', async () => {
    await expect(html(<RunCatchUpNotice text="ממשיכים מהשבוע ה-3" onDismiss={noop} />)).toMatchFileSnapshot(
      snap('run-catch-up'),
    );
  });
});

describe('streak card', () => {
  const cards = {
    broken1: noticeCard({ kind: 'broken', previous: 1, best: 1, on: T }),
    broken23: noticeCard({ kind: 'broken', previous: 5, best: 1234, on: T }),
    usedOneLeft1: noticeCard({ kind: 'shield_used', days: [T], left: 1, on: T }),
    usedTwoLeft2: noticeCard({ kind: 'shield_used', days: [T, T], left: 2, on: T }),
    usedOneLeft0: noticeCard({ kind: 'shield_used', days: [T], left: 0, on: T }),
    usedTwoLeft0: noticeCard({ kind: 'shield_used', days: [T, T], left: 0, on: T }),
    earned: noticeCard({ kind: 'shield_earned', held: 2, streak: 14, on: T }),
  };
  it.each(Object.entries(cards))('notice %s', async (name, card) => {
    await expect(html(<StreakNoticeView card={card} onDismiss={noop} />)).toMatchFileSnapshot(snap(`streak-${name}`));
  });

  it.each([3, 7, 14, 30, 50, 100, 365])('milestone %s', async (n) => {
    const card = pickStreakCard({ notice: null, currentStreak: n, lastStreakDate: T, todayKey: T, seen: new Set() })!;
    expect(card.kind).toBe('milestone');
    await expect(html(<StreakNoticeView card={card} onDismiss={noop} />)).toMatchFileSnapshot(
      snap(`streak-milestone-${n}`),
    );
  });
});

describe('first-week card', () => {
  const card = (day: number, href: string | null) => ({
    day,
    lever: 'walk' as never,
    title: 'כותרת',
    body: 'גוף',
    href,
    ctaLabel: href ? 'למפה' : null,
  });
  it.each([
    [0, null],
    [3, '/map'],
  ] as const)('day %s', async (day, href) => {
    await expect(html(<FirstWeekCard card={card(day, href)} track="strength" onDismiss={noop} />)).toMatchFileSnapshot(
      snap(`first-week-day${day}`),
    );
  });
  it('chip labels', async () => {
    await expect([0, 1, 7].map(firstWeekChipLabel).join('\n')).toMatchFileSnapshot(snap('first-week-chips.txt'));
  });
});

describe('ghost upsell + processing overlay', () => {
  it.each(['card', 'silent'] as const)('GhostUpsell default CTA, %s', async (variant) => {
    await expect(
      html(
        <GhostUpsell onClick={noop} label="label" variant={variant}>
          <div>x</div>
        </GhostUpsell>,
      ),
    ).toMatchFileSnapshot(snap(`ghost-upsell-${variant}`));
  });
  it('ProcessingOverlay visible', async () => {
    await expect(html(<ProcessingOverlay isVisible onComplete={noop} />)).toMatchFileSnapshot(snap('processing'));
  });
});

describe('strength top-up title', () => {
  it('counts', async () => {
    await expect([0, 1, 2, 6, 1234].map(topUpTitleHe).join('\n')).toMatchFileSnapshot(snap('top-up-titles.txt'));
  });
});

describe('run week list v2', () => {
  const schedule = [
    { week: 2, day: 1, workoutId: 'a', category: 'easy_run', workoutName: 'ריצה קלה' },
    { week: 2, day: 2, workoutId: 'b', category: 'tempo' },
    { week: 2, day: 3, workoutId: 'c', category: 'long_run' },
  ];
  const props = {
    schedule,
    week: 2,
    programLabel: 'תוכנית 5 ק״מ',
    scheduleDays: ['א', 'ג', 'ה'],
    targetDay: 2,
    todayWorkout: null,
    onStartToday: noop,
  };
  it.each([
    ['run day, 8 weeks, skip', { isRunDay: true, totalWeeks: 8, onSkipToday: noop }],
    ['rest day, no total, undo', { isRunDay: false, onUndoSkip: noop }],
  ] as const)('%s', async (name, extra) => {
    await expect(html(<RunWeekListV2 {...props} {...extra} />)).toMatchFileSnapshot(
      snap(`run-week-${name.replace(/[ ,]+/g, '-')}`),
    );
  });
});

describe('run return drawer', () => {
  const ask = (reason: 'restart' | 'half_back', reachedWeek: number, daysAway: number, raceDate: string | null) => ({
    decision: { reason, targetWeek: 3, reachedWeek, offerLevelCheck: true, ask: true },
    beginner: false,
    level: 'intermediate',
    daysAway,
    planWeeks: 8,
    raceDate,
  });
  it.each([
    ['resume ok, no race', ask('half_back', 2, 10, null)],
    ['resume blocked, race far', ask('restart', 9, 90, '2027-06-01')],
    ['race soon', ask('half_back', 4, 30, '2026-11-10')],
  ] as const)('%s', async (name, a) => {
    await expect(
      html(<RunReturnDrawer ask={a as never} onChoose={async () => true} onClose={noop} />),
    ).toMatchFileSnapshot(snap(`run-return-${name.replace(/[ ,]+/g, '-')}`));
  });
});
