/**
 * Kelly round 4 on the device: the aerobic card face, what a tap opens (the planned-run stash),
 * tour replay requests, the help hub's search over the shared entries, the round4 stream event.
 */
import { describe, it, expect } from 'vitest';
import { aerobicCardFace } from '../services/aerobic-card-view.pure';
import { makeT } from '@/lib/i18n/t';
import { coach } from '@/messages/ns/coach';
import { freeAerobicHref, parkHref, plannedRunFromCard } from '../services/round4-actions';
import { consumeTourReplay, requestTourReplay, TOUR_REPLAY_KEY } from '@/features/user/onboarding/services/tour-replay';
import { getHelpEntries } from '@/lib/app-help/loader';
import { HELP_CHAPTERS } from '@/lib/app-help/chapters';
import { searchHelp } from '@/lib/app-help/search';
import { sanitizePlannedRun } from '@/lib/planned-run';
import { chatReducer, initialChatState, LIVE_ID } from '../state/chat-machine';
import { COACH_ACTIONS, ROUND4_ACTION_IDS } from '@/lib/ai/coach/action-chips';
import type { AerobicCardView } from '@/lib/ai/coach/round4/types';

const card: AerobicCardView = {
  id: 'aer-test-0001',
  kind: 'easy_run',
  title: 'ריצה קלה של 25 דקות',
  minutes: 25,
  distanceKm: null,
  cue: 'קצב שיחה: אפשר לדבר במשפטים מלאים',
  strengthStops: false,
  route: { status: 'map' },
  goal: { type: 'time', value: 25 },
};

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

describe('aerobic card', () => {
  it('face: amount, by feel, route; Hebrew only', () => {
    const f = aerobicCardFace(card, makeT('he', coach));
    expect(f.chips.map((c) => c.label)).toEqual(['25 דק׳', 'לפי תחושה', 'מסלול במפה']);
    expect(f.cta).toBe('פתח ריצה במפה');
    expect(f.ariaLabel).not.toMatch(/[A-Za-z]/);
  });
  it('a tap pre-fills the free run drawer through the existing planned-run stash', () => {
    const pr = plannedRunFromCard({ ...card, strengthStops: true });
    expect(sanitizePlannedRun(pr)).toEqual(pr);
    expect(pr.hybrid?.aerobicShare).toBe(0.6);
    expect(freeAerobicHref('walking')).toBe('/map?openRun=walking');
    expect(parkHref('abc123')).toBe('/map?openPark=abc123');
  });
});

describe('tour replay', () => {
  it('request → consumed once on the right screen; stale and other tours ignored', () => {
    const kv = memStore();
    expect(requestTourReplay('home', 2, kv, 1000)).toBe('/home');
    expect(consumeTourReplay('map', kv, 1500)).toBeNull();
    expect(consumeTourReplay('home', kv, 1500)).toEqual({ step: 2 });
    expect(consumeTourReplay('home', kv, 1600)).toBeNull();
    requestTourReplay('map', 0, kv, 0);
    expect(consumeTourReplay('map', kv, 10 * 60_000)).toBeNull();
    expect(kv.m.has(TOUR_REPLAY_KEY)).toBe(false);
  });
});

describe('help hub entries', () => {
  const entries = getHelpEntries();
  it('one shared shape, every chapter entry exists', () => {
    for (const e of entries) {
      expect(e).toMatchObject({ audience: 'users', locale: 'he' });
      expect(e.a.length).toBeGreaterThan(0);
    }
    const ids = new Set(entries.map((e) => e.id));
    for (const c of HELP_CHAPTERS) for (const id of c.entryIds) expect(ids.has(id), `${c.id} → ${id}`).toBe(true);
  });
  it('search finds by Hebrew words, prefixes tolerated', () => {
    expect(searchHelp(entries, 'איך מחברים צעדים')[0]?.id).toBe('steps');
    expect(searchHelp(entries, 'השבת')[0]?.id).toBe('notifications');
    expect(searchHelp(entries, 'x')).toHaveLength(entries.length);
  });
});

describe('chips and stream', () => {
  it('round 4 chips have labels and no raw links except the help hub', () => {
    for (const id of ROUND4_ACTION_IDS) {
      const s = COACH_ACTIONS[id];
      expect(s.label).toMatch(/[א-ת]/);
      if (s.href) expect(s.href).toBe('/help');
    }
  });
  it('the round4 event lands on the live reply; a bad payload is dropped', () => {
    let s = chatReducer({ ...initialChatState, phase: 'streaming' }, { type: 'EVENT', event: { type: 'text', delta: 'היי' } });
    s = chatReducer(s, { type: 'EVENT', event: { type: 'round4', extras: { aerobic: card } } });
    expect(s.messages.find((m) => m.id === LIVE_ID)?.round4?.aerobic?.id).toBe('aer-test-0001');
    const bad = chatReducer(s, { type: 'EVENT', event: { type: 'round4', extras: { parks: [{ parkId: '../x', name: 'a', distanceKm: 1, equipment: [], area: null }] } } });
    expect(bad).toBe(s);
  });
});
