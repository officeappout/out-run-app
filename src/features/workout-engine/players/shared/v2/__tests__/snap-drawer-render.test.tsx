/**
 * enable_strength_drawer_v1 — static renders: without a drawer every card is
 * today's markup; with one, the grabber + the remembered snap (full content or
 * the compact row).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, db: {} }));

import PlayerDrawerBody from '../PlayerDrawerBody';
import PlayerDrawerCompact from '../PlayerDrawerCompact';
import { useSnapDrawer } from '../useSnapDrawer';
import { rememberSnap, resetRememberedSnaps } from '../snap-drawer-logic';
import TimedWorkCard from '../../../strength/timed/components/TimedWorkCard';
import TimedClockCard from '../../../strength/timed/components/TimedClockCard';
import type { TimedItem } from '@/features/workout-engine/engines/timed/timed.types';

afterEach(() => resetRememberedSnaps());

function Harness({ enabled, withCompact = true }: { enabled: boolean; withCompact?: boolean }) {
  const drawer = useSnapDrawer('test', enabled);
  return (
    <PlayerDrawerBody
      drawer={enabled ? drawer : null}
      fallbackGrabber={<i id="old-grabber" />}
      compact={withCompact ? <PlayerDrawerCompact drawer={drawer} title="שכיבות סמיכה" value="12" unit="חזרות" caption="סבב 2" /> : null}
    >
      <div id="full">FULL</div>
    </PlayerDrawerBody>
  );
}

describe('PlayerDrawerBody', () => {
  it('no drawer → today\'s grabber + full content', () => {
    rememberSnap('test', 'compact');
    const html = renderToStaticMarkup(<Harness enabled={false} />);
    expect(html).toContain('id="old-grabber"');
    expect(html).toContain('id="full"');
    expect(html).not.toContain('data-snap-drawer-grabber');
  });
  it('drawer, full snap → the snap grabber + full content', () => {
    const html = renderToStaticMarkup(<Harness enabled />);
    expect(html).toContain('data-snap-drawer-grabber');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('id="full"');
    expect(html).not.toContain('id="old-grabber"');
  });
  it('drawer, remembered compact → the compact row only', () => {
    rememberSnap('test', 'compact');
    const html = renderToStaticMarkup(<Harness enabled />);
    expect(html).toContain('data-player-drawer-compact');
    for (const v of ['שכיבות סמיכה', '12', 'חזרות', 'סבב 2']) expect(html).toContain(v);
    expect(html).not.toContain('id="full"');
    expect(html).toContain('aria-label="הצגת הכרטיס המלא"');
  });
  it('a phase without a compact row never collapses', () => {
    rememberSnap('test', 'compact');
    const html = renderToStaticMarkup(<Harness enabled withCompact={false} />);
    expect(html).toContain('id="full"');
    expect(html).toContain('id="old-grabber"');
  });
});

const item = { key: 'a', kind: 'exercise', exerciseId: 'e1', name: 'סקוואט', targetReps: 15 } as unknown as TimedItem;

function TimedHarness({ enabled, clock = false }: { enabled: boolean; clock?: boolean }) {
  const d = useSnapDrawer('timed', enabled);
  const drawer = enabled ? d : null;
  return clock ? (
    <TimedClockCard mode="rest" eyebrow="סבב 3/8" warn={false} clock="0:07" item={item} nextCaption="התרגיל הבא" drawer={drawer} />
  ) : (
    <TimedWorkCard eyebrow="סבב 2" warn={false} item={item} next={null} nextCaption="הבא בסבב" hint={null} onDone={() => {}} drawer={drawer} />
  );
}

describe('timed cards', () => {
  it('flag off: identical to a card rendered without the prop', () => {
    rememberSnap('timed', 'compact');
    const off = renderToStaticMarkup(<TimedHarness enabled={false} />);
    const plain = renderToStaticMarkup(
      <TimedWorkCard eyebrow="סבב 2" warn={false} item={item} next={null} nextCaption="הבא בסבב" hint={null} onDone={() => {}} />,
    );
    expect(off).toBe(plain);
  });
  it('work card compact: name, target, round and the done action', () => {
    rememberSnap('timed', 'compact');
    const html = renderToStaticMarkup(<TimedHarness enabled />);
    expect(html).toContain('data-player-drawer-compact');
    for (const v of ['סקוואט', '15', 'סבב 2', 'סיימתי']) expect(html).toContain(v);
    expect(html).not.toContain('הבא בסבב');
  });
  it('rest card compact: the clock and what comes next', () => {
    rememberSnap('timed', 'compact');
    const html = renderToStaticMarkup(<TimedHarness enabled clock />);
    for (const v of ['0:07', 'סבב 3/8', 'התרגיל הבא · סקוואט']) expect(html).toContain(v);
  });
});
