/** TV-mode screens, static markup (node env): Hebrew copy comes from the `wide` catalog, nothing hover-only, RTL-safe. */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }), useSearchParams: () => new URLSearchParams() }));

import { initialMirror, mirrorReducer } from '../core/mirror';
import type { TvParticipant, TvSession } from '../core/types';
import TvRemote from '../phone/TvRemote';
import TvPhoneLost from '../phone/TvPhoneLost';
import TvJoinedPanel from '../phone/TvJoinedPanel';
import TvJoinLanding from '../phone/TvJoinLanding';

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

describe('phone screens', () => {
  const mirror = mirrorReducer(initialMirror(), { type: 'exercise', index: 0, count: 5, name: 'מתח רחב', setCount: 5, repsMin: 8, repsMax: 12 });
  const controls = { togglePause: () => {}, next: () => {}, prev: () => {}, skipExercise: () => {} };
  it('remote: every control is a labelled button, volume is a range input, friends are listed', () => {
    const html = renderToStaticMarkup(<TvRemote session={{ ...session, status: 'live' }} mirror={{ ...mirror, together: true }} controls={controls} participants={people} serverNow={0} />);
    for (const label of ['aria-label="הקודם"', 'aria-label="השהיה"', 'aria-label="הבא"', 'aria-label="עוצמת קול"']) expect(html).toContain(label);
    expect(html).toContain('type="range"');
    expect(html).toContain('דילוג על התרגיל');
    expect(html).toContain('ניתוק');
    expect(html).toContain('ביחד');
    expect(html).toContain('החברים · לייב');
    expect(html).toContain('דני');
  });
  it('remote shows continue instead of pause when paused', () => {
    const html = renderToStaticMarkup(<TvRemote session={{ ...session, status: 'live' }} mirror={{ ...mirror, paused: true }} controls={controls} participants={[]} serverNow={0} />);
    expect(html).toContain('aria-label="המשך"');
  });
  it('lost: retry + continue on the phone only', () => {
    const html = renderToStaticMarkup(<TvPhoneLost onRetry={() => {}} onPhoneOnly={() => {}} />);
    expect(html).toContain('החיבור למסך אבד');
    expect(html).toContain('ניסיון חוזר');
    expect(html).toContain('המשך בטלפון בלבד');
  });
  it('participant: joined room, waiting for the host', () => {
    const html = renderToStaticMarkup(<TvJoinedPanel session={session} participants={people} />);
    expect(html).toContain('הצטרפת לאימון של נועה');
    expect(html).toContain('35 דק׳ · אותו אימון לכולם');
    expect(html).toContain('ממתינים שהמארחת תתחיל');
    expect(html).toContain('יציאה מהחדר');
  });
  it('web landing (no app): store links from the shared config', () => {
    const html = renderToStaticMarkup(<TvJoinLanding code="482913" />);
    expect(html).toContain('apps.apple.com');
    expect(html).toContain('play.google.com');
    expect(html).toContain('482 913');
    expect(html).toContain('כדי להצטרף צריך את האפליקציה');
  });
});
