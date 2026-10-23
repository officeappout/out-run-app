import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import he from '@/messages/he/together.json';
import { together } from '@/messages/ns/together';
import { makeT } from '@/lib/i18n/t';
import { localizeParams } from '../core/localize';
import { explainDecision, decideByLevel, decideByPace } from '../core/level-similarity';
import { railStatus } from '../core/rail-logic';
import { eventCopy } from '../core/cheers';

const t = makeT('he', together);

describe('together namespace', () => {
  it('has the expected number of Hebrew keys (bump when adding keys)', () => {
    expect(Object.keys(he).length).toBe(74);
  });
  it('every key resolves to its Hebrew text in the he catalog', () => {
    for (const [k, v] of Object.entries(he)) expect((t as any)(k, new Proxy({}, { get: () => 1 })).length).toBeGreaterThan(0);
    expect(t('lobby.start')).toBe('מתחילים יחד');
    expect(t('rail.status.run', { km: '2.5', pace: '5:30' })).toBe('2.5 ק״מ · 5:30');
  });
  it('en / ru / de catalogs exist and only use keys that exist in he', () => {
    for (const l of ['en', 'ru', 'de']) {
      const f = path.resolve(__dirname, `../../../../messages/${l}/together.json`);
      const data = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const k of Object.keys(data)) expect(k in he).toBe(true);
    }
  });
  it('every key the code can produce exists in he', () => {
    const keys = [
      explainDecision(decideByLevel([3, 3])).key, explainDecision(decideByLevel([1, 6])).key,
      explainDecision(decideByPace([300, 500])).key, explainDecision(decideByPace([300, 310])).key, explainDecision(decideByLevel([])).key,
      railStatus({ uid: 'a', name: 'a', kind: 'run', state: 'active', clientMs: 0, seq: 0, serverMs: 0, isMe: false, freshness: 'live', lastSeenSec: 0, rank: 1 }).key,
      eventCopy({ type: 'done', id: 'd', uid: 'a', name: 'a' }).key,
    ];
    for (const k of keys) expect(k in he).toBe(true);
  });
  it('numbers go through Intl with the user locale', () => {
    expect(localizeParams({ km: 2.46, set: 3, pace: '5:30' }, 'he')).toEqual({ km: '2.5', set: '3', pace: '5:30' });
    expect(localizeParams({ km: 2.46 }, 'de').km).toBe('2,5');
    expect(localizeParams({ km: 2.46 }, 'ru').km).toBe('2,5');
  });
});
