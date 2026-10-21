/**
 * enable_run_player_drawer_v1 — the shared drawer + header strip render
 * (static markup): full snap shows the caller's card, compact shows time ·
 * distance · pace with pause + hold-to-stop; the header strip is attached to
 * the top edge (full-bleed, safe-area padded), not a floating card.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null } }));

import RunMetricsDrawer from '../RunMetricsDrawer';
import RunHeaderStrip from '../RunHeaderStrip';
import { rememberDrawerSnap } from '../run-drawer-logic';

const compact = {
  time: '24:07',
  distanceKm: '3.42',
  rate: '5:41',
  rateLabel: 'קצב',
  isPaused: false,
  onPause: () => {},
  onResume: () => {},
  onStop: () => {},
};

describe('RunMetricsDrawer', () => {
  it('full snap: renders the full card + a collapse handle', () => {
    rememberDrawerSnap('full');
    const html = renderToStaticMarkup(
      <RunMetricsDrawer full={<div id="full-card">FULL</div>} compact={compact} onOpenList={() => {}} cardRef={() => {}} bottomGapPx={12} />,
    );
    expect(html).toContain('id="full-card"');
    expect(html).toContain('data-run-drawer="full"');
    expect(html).toContain('aria-label="הקטנת המדדים"');
    expect(html).not.toContain('24:07');
    expect(html).toContain('calc(env(safe-area-inset-bottom, 0px) + 12px)');
  });

  it('compact snap: time · distance · pace, pause and hold-to-stop', () => {
    rememberDrawerSnap('compact');
    const html = renderToStaticMarkup(
      <RunMetricsDrawer full={<div id="full-card">FULL</div>} compact={compact} onOpenList={() => {}} cardRef={() => {}} bottomGapPx={12} />,
    );
    rememberDrawerSnap('full');
    expect(html).not.toContain('id="full-card"');
    expect(html).toContain('data-run-drawer="compact"');
    for (const v of ['24:07', '3.42', '5:41', 'זמן', 'ק״מ', 'קצב']) expect(html).toContain(v);
    expect(html).toContain('aria-label="סיום אימון · לחיצה ארוכה"');
    expect(html).toContain('aria-label="הצגת כל המדדים"');
    // the entry flow's "end workout" tip points at the compact controls
    expect(html).toContain('data-coach="route-player-controls"');
  });
});

describe('RunHeaderStrip', () => {
  it('is attached to the top edge, full-bleed, story bars first', () => {
    const html = renderToStaticMarkup(
      <RunHeaderStrip strip={<div id="bars" />} eyebrow="ריצה קלה · יעד 35 דק׳" title="נותרו 14:34 דק׳" />,
    );
    expect(html).toContain('absolute inset-x-0 top-0');
    expect(html).toContain('padding-top:env(safe-area-inset-top, 0px)');
    expect(html).not.toContain('rounded-[22px]');
    expect(html.indexOf('id="bars"')).toBeLessThan(html.indexOf('ריצה קלה'));
  });
});
