import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { player } from '@/messages/ns/player';
import enPlayer from '@/messages/en/player.json';
import { useLocaleStore } from '@/store/useLocaleStore';
import { blockTitle, clockCaption } from '@/features/workout-engine/players/strength/timed/logic/timed-labels';
import { __resetCatalogsForTests, registerCatalog } from '../catalogs';
import { makeLiveT } from '../live-t';
import { makeT } from '../t';

beforeEach(() => __resetCatalogsForTests());
afterEach(() => useLocaleStore.setState({ locale: 'he', gender: 'other' }));

describe('makeLiveT', () => {
  it('Hebrew (default) equals makeT("he") exactly, including gender-less select branches', () => {
    const live = makeLiveT(player);
    const he = makeT('he', player);
    useLocaleStore.setState({ gender: 'female' });
    for (const key of ['survey.thanksEasy', 'timedLabels.now', 'timedLabels.clock.left'] as const) expect(live(key)).toBe(he(key));
    expect(live.locale).toBe('he');
  });

  it('follows the store at call time (module-scope translator, English after the locale switches)', () => {
    registerCatalog('en', 'player', enPlayer as Record<string, string>);
    const live = makeLiveT(player);
    const heText = live('timedLabels.clock.left');
    useLocaleStore.setState({ locale: 'en' });
    expect(live('timedLabels.clock.left')).toBe(makeT('en', player)('timedLabels.clock.left'));
    expect(live('timedLabels.clock.left')).not.toBe(heText);
    expect(clockCaption({ status: 'running' } as never)).toBe(live('timedLabels.clock.left'));
    expect(blockTitle({ format: 'tabata', config: { workSec: 20, restSec: 10, rounds: 8 }, items: [] } as never)).toBe(
      makeT('en', player)('timedLabels.title.tabata', { work: '20', rest: '10' }),
    );
    expect(live.locale).toBe('en');
  });
});
