/** TV-mode screens, static markup (node env): Hebrew copy comes from the `wide` catalog, nothing hover-only, RTL-safe. */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }), useSearchParams: () => new URLSearchParams() }));

import TvStageAdapter from '../adapter/TvStageAdapter';
import { buildStageModel } from '../adapter/stage-model';
import { initialMirror, mirrorReducer } from '../core/mirror';
import type { TvParticipant, TvSession } from '../core/types';
import TvLobbyScreen from '../tv/TvLobbyScreen';
import TvPairingScreen from '../tv/TvPairingScreen';
import { TvLostBanner, TvReconnectCorner } from '../tv/TvLostBanner';
import TvEndedScreen from '../tv/TvEndedScreen';
import FullscreenGate from '../tv/FullscreenGate';

const session: TvSession = {
  code: '482913', hostUid: 'noa', hostName: 'נועה', hostGender: 'female', status: 'lobby',
  createdAtMs: 0, expiresAtMs: 4 * 3600_000, hostBeatAtMs: null,
  workout: { title: 'מתח רחב', kind: 'strength', durationMin: 35, exerciseCount: 5 },
  mirror: null, timerAnchorAtMs: null, volume: 0.6, cmd: null,
};
const people: TvParticipant[] = [
  { uid: 'noa', name: 'נועה', joinedAtMs: 1, state: 'joined', seq: 0 },
  { uid: 'dani', name: 'דני', joinedAtMs: 2, state: 'active', set: 3, totalSets: 5, seq: 1 },
];

describe('TV pairing / lobby', () => {
  it('pairing: one QR, one code, the steps, the 4-hour note, big focusable layout', () => {
    const html = renderToStaticMarkup(<TvPairingScreen code="482913" origin="https://outrun.co.il" expiresAtMs={4 * 3600_000} nowMs={0} />);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('482 913');
    expect(html).toContain('aria-label="קוד QR לחיבור"');
    expect(html).toContain('הקוד תקף ל־4 שעות');
    expect(html).toContain('ממתינים לחיבור…');
    expect(html).toContain('outrun.co.il/tv');
    expect(html).not.toContain('hover:');
  });
  it('lobby: host tagged, equal list, count + waiting line with the host gender', () => {
    const html = renderToStaticMarkup(<TvLobbyScreen session={session} participants={people} origin="https://outrun.co.il" />);
    expect(html).toContain('מי בסלון?');
    expect(html).toContain('מארח');
    expect(html).toContain('בחדר');
    expect(html).toContain('שני משתתפים');
    expect(html).toContain('ממתינים שהמארחת תתחיל');
    expect(html).toContain('אימון כוח · מתח רחב');
  });
  it('gate: one autofocus button', () => {
    const html = renderToStaticMarkup(<FullscreenGate onStart={() => {}} />);
    expect(html).toContain('לחצו OK להתחלה');
    expect(html.match(/<button/g)).toHaveLength(1);
  });
  it('ended / expired offer a new code', () => {
    expect(renderToStaticMarkup(<TvEndedScreen reason="expired" onNewCode={() => {}} />)).toContain('הקוד פג תוקף');
    expect(renderToStaticMarkup(<TvEndedScreen reason="ended" onNewCode={() => {}} />)).toContain('קוד חדש');
  });
});

describe('TV stage (wide adapter)', () => {
  const mirror = mirrorReducer(
    mirrorReducer(initialMirror(), { type: 'exercise', index: 2, count: 5, name: 'מתח רחב', next: 'מקבילים', setCount: 5, repsMin: 8, repsMax: 12 }),
    { type: 'phase', phase: 'work', timer: { dir: 'down', baseMs: 42_000, running: false, totalMs: 60_000 } },
  );
  it('clock, exercise, set, next up and the friends row', () => {
    const model = buildStageModel({ mirror, timerAnchorAtMs: null, serverNowMs: 0, friends: people });
    const html = renderToStaticMarkup(<TvStageAdapter model={model} />);
    expect(html).toContain('0:42');
    expect(html).toContain('מתח רחב');
    expect(html).toContain('סט 1 מתוך 5');
    expect(html).toContain('יעד: 8–12 חזרות');
    expect(html).toContain('מקבילים');
    expect(html).toContain('סט 3 מתוך 5');
    expect(html).toContain('role="progressbar"');
  });
  it('rest and done have their own headline, paused is announced', () => {
    const rest = mirrorReducer(mirror, { type: 'phase', phase: 'rest', timer: { dir: 'down', baseMs: 30_000, running: false, totalMs: 30_000 } });
    expect(renderToStaticMarkup(<TvStageAdapter model={buildStageModel({ mirror: rest, timerAnchorAtMs: null, serverNowMs: 0, friends: [] })} />)).toContain('מנוחה');
    const paused = mirrorReducer(mirror, { type: 'pause', readingMs: 5000 });
    expect(renderToStaticMarkup(<TvStageAdapter model={buildStageModel({ mirror: paused, timerAnchorAtMs: null, serverNowMs: 0, friends: [] })} />)).toContain('מושהה');
    const done = mirrorReducer(mirror, { type: 'done' });
    expect(renderToStaticMarkup(<TvStageAdapter model={buildStageModel({ mirror: done, timerAnchorAtMs: null, serverNowMs: 0, friends: [] })} />)).toContain('כל הכבוד');
  });
  it('lost state: amber banner + small QR + code, the clock is still drawn', () => {
    const model = buildStageModel({ mirror, timerAnchorAtMs: null, serverNowMs: 0, friends: [] });
    const html = renderToStaticMarkup(<TvStageAdapter model={model} banner={<TvLostBanner />} />) + renderToStaticMarkup(<TvReconnectCorner code="482913" origin="https://outrun.co.il" />);
    expect(html).toContain('הטלפון התנתק · האימון ממשיך · ממתינים לחיבור מחדש');
    expect(html).toContain('482 913');
    expect(html).toContain('0:42');
  });
});
