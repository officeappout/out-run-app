/**
 * enable_where_to_train_v1 — partners' training-here shares as feed activity items: the author's
 * gender drives the line (neutral when unknown), the viewer's gender the "מצטרף/ת" action.
 * `<!-- -->` stripped; zustand state written into getInitialState() (server snapshot).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('@/features/admin/services/planned-sessions.service', () => ({ createPlannedSession: async () => 'id' }));

import { PartnerTrainingSharesList } from '../training-shares/PartnerTrainingShares';
import type { TrainingShareJson } from '@/features/social/services/training-share-visibility';
import { useLocaleStore } from '@/store/useLocaleStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const DEFAULTS = { ...useLocaleStore.getInitialState() };
const now = new Date('2026-10-26T16:20:00');
const base: TrainingShareJson = {
  id: 's', userId: 'noa', displayName: 'נועה', photoURL: null, gender: 'female', parkId: 'p1', parkName: 'גינת הירקון',
  lat: 1, lng: 2, activityType: 'workout', startTime: new Date('2026-10-26T16:15:00').toISOString(), endTime: null, audience: 'partners',
};
const later = { ...base, id: 'l', startTime: new Date('2026-10-26T18:00:00').toISOString() };
const noop = () => {};

beforeEach(() => { Object.assign(useLocaleStore.getInitialState(), DEFAULTS, { gender: 'other' }); });

describe('PartnerTrainingSharesList', () => {
  it('now / later lines by the author\'s gender', () => {
    const f = html(<PartnerTrainingSharesList shares={[base, later]} now={now} onJoin={noop} />);
    expect(f).toContain('נועה מתאמנת עכשיו בגינת הירקון');
    expect(f).toContain('נועה מגיעה ב-18:00 לגינת הירקון');
    const m = html(<PartnerTrainingSharesList shares={[{ ...base, displayName: 'דן', gender: 'male' }, { ...later, displayName: 'דן', gender: 'male' }]} now={now} onJoin={noop} />);
    expect(m).toContain('דן מתאמן עכשיו בגינת הירקון');
    expect(m).toContain('דן מגיע ב-18:00 לגינת הירקון');
    const o = html(<PartnerTrainingSharesList shares={[{ ...base, displayName: 'אלכס', gender: 'other' }]} now={now} onJoin={noop} />);
    expect(o).toContain('אלכס · אימון עכשיו בגינת הירקון');
  });
  it.each([['female', 'מצטרפת'], ['male', 'מצטרף'], ['other', 'הצטרפות']] as const)('join action for a %s viewer', (gender, label) => {
    Object.assign(useLocaleStore.getInitialState(), { gender });
    expect(html(<PartnerTrainingSharesList shares={[base]} now={now} onJoin={noop} />)).toContain(`>${label}</button>`);
  });
  it('nothing without shares', () => {
    expect(html(<PartnerTrainingSharesList shares={[]} now={now} onJoin={noop} />)).toBe('');
  });
  it('snapshot', async () => {
    await expect(html(<PartnerTrainingSharesList shares={[base, later]} now={now} onJoin={noop} />))
      .toMatchFileSnapshot('./__snapshots__/partner-training-shares/list.html');
  });
});
