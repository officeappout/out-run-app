/**
 * enable_wide_player_v1 — markup of the wide variant. Flag off / not wide =
 * today's markup (no wide hooks); wide = the split layout, hero clock, panel.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, db: {} }));

import WideSplit from '../WideSplit';
import WideHeroClock from '../WideHeroClock';
import { WidePlayerProvider } from '../WidePlayerContext';
import ActiveRepsWidePanel from '../../../strength/components/ActiveRepsWidePanel';
import TimedClockCard from '../../../strength/timed/components/TimedClockCard';
import type { TimedItem } from '@/features/workout-engine/engines/timed/timed.types';

const item = { key: 'a', kind: 'exercise', name: 'סקוואט', exerciseId: 'ex1' } as unknown as TimedItem;

describe('WideSplit', () => {
  it('media first (inline-start), panel second, safe margins, focus ring, optional footer', () => {
    const html = renderToStaticMarkup(
      <WidePlayerProvider value={{ enabled: true, wide: true, landscape: true, scale: 2 }}>
        <WideSplit media={<i id="m" />} panel={<b id="p" />} footer={<u id="f" />} />
      </WidePlayerProvider>,
    );
    expect(html.indexOf('data-wide-media')).toBeLessThan(html.indexOf('data-wide-panel'));
    expect(html).toContain('id="m"');
    expect(html).toContain('id="f"');
    expect(html).toContain('margin-inline-start');
    expect(html).toContain('bg-v2-surface'); // light surface around the video
    expect(html).not.toContain('bg-black flex'); // no dark page behind
    expect(html).toContain('data-wide-handle'); // drag / tap handle of the side drawer
    expect(html).toContain('border-start-start-radius:28px'); // rounded on the video side only
    expect(html).toContain('data-collapsed="false"');
    expect(html).toContain('button:focus-visible]:ring-4');
    expect(html).toContain('zoom:2');
    expect(html).not.toContain('dir="rtl"'); // direction follows the document, not a hard-coded side
    expect(html).not.toMatch(/(^|[\s"])(left|right)-\d/); // no physical left/right utilities
  });
  it('no footer → no footer row', () => {
    expect(renderToStaticMarkup(<WideSplit media={null} panel={null} />)).not.toContain('data-wide-footer');
  });
});

describe('WideHeroClock', () => {
  it('big digits + clamped progress bar', () => {
    const html = renderToStaticMarkup(<WideHeroClock text="00:12" sub="/ 00:30" progress={1.7} tone="warn" />);
    expect(html).toContain('font-size:96px');
    expect(html).toContain('00:12');
    expect(html).toContain('aria-valuenow="100"');
  });
});

describe('ActiveRepsWidePanel', () => {
  it('shows name, reps, set, done, next-up and the key hints', () => {
    const html = renderToStaticMarkup(
      <WidePlayerProvider value={{ enabled: true, wide: true, landscape: true, scale: 2 }}>
        <ActiveRepsWidePanel
          activeKey="k" exerciseName="שכיבות סמיכה" repsOrDurationText="8-10" isUnilateral={false} targetValue={9}
          currentRound={2} totalRounds={3} isSupersetActive={false} supersetPartnerName={null}
          autoCompleteTime={10} isPaused={false} v2 nextUp={{ name: 'משיכות', caption: '6-8' }}
          onComplete={() => {}} onSwap={() => {}}
        />
      </WidePlayerProvider>,
    );
    for (const s of ['שכיבות סמיכה', '8-10', 'סט 2 מתוך 3', 'יעד: 9', 'סיימתי סט', 'הבא בתור', 'משיכות', 'החלפת תרגיל', 'data-wide-keys']) {
      expect(html).toContain(s);
    }
  });
});

describe('TimedClockCard', () => {
  const props = { mode: 'work' as const, eyebrow: 'סבב 1', warn: false, clock: '0:12', item, nextCaption: 'הבא' };
  it('not wide → today\'s clock size, shell is the bottom sheet', () => {
    const html = renderToStaticMarkup(<TimedClockCard {...props} />);
    expect(html).toContain('absolute inset-x-0 bottom-0');
    expect(html).not.toContain('font-size:96px');
  });
  it('wide → hero clock inside the side panel (no sheet)', () => {
    const html = renderToStaticMarkup(
      <WidePlayerProvider value={{ enabled: true, wide: true, landscape: true, scale: 2 }}>
        <TimedClockCard {...props} />
      </WidePlayerProvider>,
    );
    expect(html).toContain('data-wide-timed-card');
    expect(html).toContain('font-size:96px');
    expect(html).not.toContain('absolute inset-x-0 bottom-0');
  });
});
