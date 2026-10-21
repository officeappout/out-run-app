// @vitest-environment jsdom
/**
 * CreateGroupWizard — split-refactor parity. Recorded from the pre-split
 * 1,707-line component (the committed snapshot) and must stay byte-identical
 * after it became a thin composition of per-step modules, in BOTH
 * enable_home_v2 states. Walks every step, branch and submit path; every
 * service call is logged so a changed write or query fails the suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Dict = Record<string, unknown>;

const state = vi.hoisted(() => ({
  v2: false,
  profile: null as Dict | null,
  access: {} as Dict,
  parks: [] as Dict[],
  editGroup: null as Dict | null,
  createFails: false,
  geocodeFails: false,
}));
const helpers = vi.hoisted(() => () => import('./split-parity-helpers'));

vi.mock('framer-motion', async () => (await helpers()).framerMock);
vi.mock('canvas-confetti', async () => {
  const { logCall } = await helpers();
  return { default: (...a: unknown[]) => logCall('confetti', ...a) };
});
vi.mock('next/dynamic', async () => {
  const { serialize, registry } = await helpers();
  return {
    default: (loader: () => unknown, opts?: { loading?: () => React.ReactNode }) => {
      const name = /MiniLocationPicker|CommunityAddressSearch/.exec(String(loader))?.[0] ?? 'dynamic';
      const C = (props: Dict) => {
        registry[name] = props;
        return (
          <div data-dynamic={name} data-props={serialize(props)}>
            {opts?.loading?.()}
          </div>
        );
      };
      return C;
    },
  };
});
vi.mock('@/features/user', () => {
  const store = () => ({ profile: state.profile });
  return { useUserStore: (sel?: (s: Dict) => unknown) => (sel ? sel(store()) : store()) };
});
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: state.v2 }, loading: false }) }));
vi.mock('@/features/arena/hooks/useArenaAccess', () => ({ useArenaAccess: () => state.access }));
vi.mock('@/features/arena/services/group.service', async () => {
  const { logCall } = await helpers();
  return {
    createGroup: async (...a: unknown[]) => {
      logCall('createGroup', ...a);
      if (state.createFails) throw new Error('nope');
      return { groupId: 'gNew', inviteCode: 'AB12CD' };
    },
    updateGroup: async (...a: unknown[]) => logCall('updateGroup', ...a),
    getGroupById: async (...a: unknown[]) => { logCall('getGroupById', ...a); return state.editGroup; },
  };
});
vi.mock('@/features/admin/services/community.service', async () => {
  const { logCall } = await helpers();
  return { uploadCommunityImage: async (...a: unknown[]) => { logCall('uploadCommunityImage', ...a); return 'https://x/up.jpg'; } };
});
vi.mock('@/features/admin/services/parks.service', async () => {
  const { logCall } = await helpers();
  return { getParksByAuthority: async (...a: unknown[]) => { logCall('getParksByAuthority', ...a); return state.parks; } };
});
vi.mock('@/features/user/onboarding/components/steps/UnifiedLocation/location-utils', async () => {
  const { logCall } = await helpers();
  return {
    reverseGeocode: async (...a: unknown[]) => {
      logCall('reverseGeocode', ...a);
      if (state.geocodeFails) throw new Error('geo');
      return { displayName: 'רחוב הרצל 1, חיפה' };
    },
  };
});

import CreateGroupWizard from '@/features/arena/components/CreateGroupWizard';
import {
  mount, rerender, unmount, snapshot, resetHarness, clickButton, clickSelector, typeInto, callProp, logCall,
} from './split-parity-helpers';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}

const PARKS = [
  { id: 'pk1', name: 'גן הזיכרון', address: 'שד׳ הנשיא', location: { lat: 32.81, lng: 34.99 } },
  { id: 'pk2', name: 'פארק הכט', location: { lat: 32.79, lng: 34.96 } },
  { id: 'pk3', name: 'גן בנימין', address: 'מרכז הכרמל', location: { lat: 32.80, lng: 34.98 } },
];

function reset(v2: boolean) {
  resetHarness();
  state.v2 = v2;
  state.profile = { id: 'u1', core: { name: 'דנה', gender: 'female', anchorLat: 32.8, anchorLng: 34.98, isSuperAdmin: false } };
  state.access = { cityAuthorityId: 'city1' };
  state.parks = PARKS;
  state.editGroup = null;
  state.createFails = false;
  state.geocodeFails = false;
}

const onClose = () => logCall('onClose');
const onSuccess = (id: string) => logCall('onSuccess', id);

beforeEach(() => {
  window.open = ((...a: unknown[]) => { logCall('window.open', ...a); return null; }) as typeof window.open;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t: string) => logCall('clipboard.writeText', t) },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

const wizard = (props: Partial<React.ComponentProps<typeof CreateGroupWizard>> = {}) =>
  <CreateGroupWizard isOpen onClose={onClose} onSuccess={onSuccess} {...props} />;

const next = () => clickButton('המשך');
const back = () => clickSelector('[aria-label="חזרה"]');

for (const v2 of [false, true]) {
  const label = v2 ? 'enable_home_v2 ON' : 'enable_home_v2 OFF';

  describe(`${label} — byte-identical to the pre-split wizard`, () => {
    beforeEach(() => reset(v2));

    it('closed → nothing; then opened', async () => {
      await mount(wizard({ isOpen: false }));
      const steps = [snapshot()];
      await rerender(wizard());
      steps.push(snapshot());
      expect(steps).toMatchSnapshot();
    });

    it('create: family, full walk-through, private success screen', async () => {
      await mount(wizard());
      const steps = [snapshot()];
      await clickButton(/משפחה/);
      steps.push(snapshot());
      await next();
      steps.push(snapshot()); // basics
      await typeInto('input[type="text"]', 'משפחת כהן רצה');
      await clickButton(/יוגה/);
      await typeInto('textarea', 'כל שבת בבוקר');
      steps.push(snapshot());
      await next();
      steps.push(snapshot()); // mode
      await clickButton(/אימון משותף/);
      await next();
      steps.push(snapshot()); // when & where
      await clickButton(/פארק הכט/);
      steps.push(snapshot());
      await callProp('CommunityAddressSearch', 'onChange', { address: 'דרך הים 5, חיפה', coords: { lat: 32.82, lng: 34.97 } });
      steps.push(snapshot());
      await callProp('MiniLocationPicker', 'onChange', { lat: 32.83, lng: 34.95 });
      steps.push(snapshot());
      await clickButton('ג׳');
      await typeInto('input[type="time"]', '18:30');
      await clickButton(/הוספה/); // gender batch 3: was "הוסף"
      await clickButton('ה׳');
      await typeInto('input[type="time"]', '07:15');
      await clickButton(/הוספה/); // gender batch 3: was "הוסף"
      steps.push(snapshot());
      await clickSelector('[aria-label="הסרת המועד"]');
      steps.push(snapshot());
      await next();
      steps.push(snapshot()); // privacy
      await clickButton(/^כן/);
      await typeInto('textarea', 'כבוד הדדי');
      steps.push(snapshot());
      await next();
      steps.push(snapshot()); // finalize
      await clickButton(/צורי קהילה/);
      steps.push(snapshot()); // success
      await clickButton(/העתק קוד/);
      steps.push(snapshot());
      await clickButton(/שתף בוואטסאפ|שיתוף בוואטסאפ/); // gender batch 3: v2 → noun "שיתוף בוואטסאפ"
      await clickButton(/כניסה לקהילה/);
      steps.push(snapshot());
      expect(steps).toMatchSnapshot();
    });

    it('create: neighborhood, solo mode skips when/where, public success, back chain to close', async () => {
      state.profile = { id: 'u1', core: { name: 'דן', gender: 'male' } };
      state.geocodeFails = true;
      await mount(wizard());
      await next();
      await typeInto('input[type="text"]', 'רצי השכונה');
      await next();
      await clickButton(/כל אחד בקצב שלו/);
      const steps = [snapshot()];
      await next();
      steps.push(snapshot()); // privacy (skipped when/where)
      await back();
      steps.push(snapshot()); // back to mode
      await clickButton(/אימון משותף/);
      await next();
      steps.push(snapshot()); // when/where w/o location → hint, next disabled
      await callProp('MiniLocationPicker', 'onChange', { lat: 31.5, lng: 35.1 });
      steps.push(snapshot());
      await next();
      await clickButton(/^ציבורי/);
      await next();
      await clickButton(/צור קהילה/);
      steps.push(snapshot());
      await clickButton(/כניסה לקהילה/);
      steps.push(snapshot());
      expect(steps).toMatchSnapshot();
    });

    it('back chain: steps → type → onClose; and the close button', async () => {
      await mount(wizard());
      await next();
      await back();
      const steps = [snapshot()];
      await back();
      steps.push(snapshot());
      await next();
      await clickSelector('[aria-label="סגירה"]');
      steps.push(snapshot());
      expect(steps).toMatchSnapshot();
    });

    it('outreach interstitial for work and university', async () => {
      const steps: string[] = [];
      for (const type of [/עבודה/, /קמפוס/]) {
        reset(v2);
        await mount(wizard());
        await clickButton(type);
        steps.push(snapshot());
        await next();
        steps.push(snapshot()); // outreach
        await clickButton(/שלח הודעה|שליחת הודעה/); // gender batch 3: v2 button is the noun "שליחת הודעה", v1 keeps its own text
        steps.push(snapshot());
        await clickButton(/המשך ליצירת הקבוצה/);
        steps.push(snapshot()); // basics
        await back();
        steps.push(snapshot()); // outreach again
        await back();
        steps.push(snapshot()); // basics (step stays 1)
        await next(); // disabled: no name yet
        steps.push(snapshot());
        unmount();
      }
      expect(steps).toMatchSnapshot();
    });

    it('school: private default, location optional', async () => {
      await mount(wizard());
      await clickButton(/ביה״ס/);
      await next();
      await typeInto('input[type="text"]', 'בית ספר אלון');
      await next();
      await clickButton(/אימון משותף/);
      await next();
      const steps = [snapshot()];
      await next();
      steps.push(snapshot());
      await next();
      await clickButton(/צורי קהילה/);
      steps.push(snapshot());
      expect(steps).toMatchSnapshot();
    });

    it('submit failure shows the error', async () => {
      state.createFails = true;
      await mount(wizard());
      await clickButton(/חברים/);
      await next();
      await typeInto('input[type="text"]', 'חברים');
      await next();
      await clickButton(/כל אחד בקצב שלו/);
      await next();
      await next();
      await clickButton(/צורי קהילה/);
      expect(snapshot()).toMatchSnapshot();
    });

    it('no city authority: empty parks message', async () => {
      state.access = { cityAuthorityId: null };
      await mount(wizard());
      await next();
      await typeInto('input[type="text"]', 'אבג');
      await next();
      await clickButton(/אימון משותף/);
      await next();
      expect(snapshot()).toMatchSnapshot();
    });

    it('edit mode: prefilled from Firestore, saves via updateGroup', async () => {
      state.editGroup = {
        id: 'g1', name: 'רצי הכרמל', description: 'ריצות ערב', category: 'running', groupType: 'park',
        meetingLocation: { address: 'גן הזיכרון, חיפה', location: { lat: 32.81, lng: 34.99 } },
        schedule: { dayOfWeek: 1, time: '20:00', frequency: 'weekly' },
        isPublic: false, allowJoinRequests: true, rules: 'בלי טלפונים', images: ['https://x/img.jpg'],
      };
      await mount(wizard({ editGroupId: 'g1' }));
      const steps = [snapshot()];
      await next();
      steps.push(snapshot());
      await next();
      steps.push(snapshot());
      await next();
      steps.push(snapshot());
      await next();
      steps.push(snapshot());
      await clickButton(/שמרי שינויים/);
      steps.push(snapshot());
      expect(steps).toMatchSnapshot();
    });

    it('edit mode: legacy group without hasMeetups/slots', async () => {
      state.editGroup = { id: 'g2', name: 'ישנה', category: 'walking' };
      state.profile = { id: 'u1', core: { name: 'דן', gender: 'male' } };
      await mount(wizard({ editGroupId: 'g2' }));
      const steps = [snapshot()];
      await next();
      steps.push(snapshot());
      expect(steps).toMatchSnapshot();
    });
  });
}
