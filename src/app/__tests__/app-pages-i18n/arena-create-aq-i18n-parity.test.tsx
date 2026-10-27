// @vitest-environment jsdom
/**
 * i18n wave 2 batch aq (namespace `community`, keys `arenaCreate.*`): src/app/arena/create/page.tsx — every wizard step
 * (type, info, schedule, invite, code entry, outreach), every gender, locked / unlocked city card, error state, and the
 * text it hands to WhatsApp / navigator.share. Snapshots recorded BEFORE the extraction from unmodified origin/main
 * (jsdom mount, ids normalised). The captured `window.open` / `navigator.share` payloads are appended to the markup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  gender: 'male' as string | undefined,
  city: true,
  createFails: false,
  opened: [] as string[],
  shared: [] as unknown[],
}));

vi.mock('framer-motion', async () => {
  const harness = await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness');
  return harness.motionStub;
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }) }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableLeagues: true }, loading: false }) }));
vi.mock('@/features/user', () => {
  const state = () => ({ profile: { id: 'u1', core: { name: 'דנה', gender: h.gender } } });
  return { useUserStore: (sel?: (s: unknown) => unknown) => (sel ? sel(state()) : state()) };
});
vi.mock('@/features/arena/hooks/useArenaAccess', () => ({
  useArenaAccess: () => ({ hasCityAccess: h.city, cityAuthorityId: 'haifa', orgId: null, preferredParkId: null }),
}));
vi.mock('@/features/arena/services/group.service', () => ({
  createGroup: async () => {
    if (h.createFails) throw new Error('x');
    return { groupId: 'g1', inviteCode: 'ABC123' };
  },
}));
vi.mock('@/features/arena/services/message-templates.service', () => ({ pickTemplate: async () => null }));
vi.mock('@/lib/config/app-urls', () => ({ APP_CONFIG_LINKS: { WEB_BASE_URL: 'https://outrun.example' } }));
vi.mock('@/components/ui/AccessCodeGate', () => ({
  default: (p: { orgName: string; onSuccess: (r: unknown) => void }) => (
    <div data-gate={p.orgName}>
      <button onClick={() => p.onSuccess({ unitPath: ['x'] })}>stub-success</button>
    </div>
  ),
}));
vi.mock('@/components/ui/UnitJoinSuccessBanner', () => ({ default: () => <div data-banner="" /> }));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import { useLocaleStore } from '@/store/useLocaleStore';
import CreateGroupPage from '../../arena/create/page';

const snap = (name: string) => `./__snapshots__/arena-create-aq-i18n/${name}.html`;
let m: Mounted | null = null;
const settle = async () => {
  for (let i = 0; i < 4; i++) await m!.advance(0);
};
const GENDERS = ['male', 'female', 'other'] as const;
const setGender = (g: (typeof GENDERS)[number]) => {
  h.gender = g === 'other' ? undefined : g;
  useLocaleStore.setState({ gender: g });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
  h.gender = 'male';
  h.city = true;
  h.createFails = false;
  h.opened = [];
  h.shared = [];
  useLocaleStore.setState({ gender: 'male' });
  (window as unknown as { open: unknown }).open = (url: string) => {
    h.opened.push(decodeURIComponent(url));
    return null;
  };
  (navigator as unknown as { share: unknown }).share = async (data: unknown) => {
    h.shared.push(data);
  };
});
afterEach(() => {
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const open = async (path: string[], gender: (typeof GENDERS)[number] = 'male') => {
  setGender(gender);
  m?.unmount();
  m = await mount(<CreateGroupPage />);
  await settle();
  for (const step of path) {
    await m.clickText(step);
    await settle();
  }
};
const captured = () => `\n<!-- opened ${JSON.stringify(h.opened)} shared ${JSON.stringify(h.shared)} -->`;

describe('arena create wizard', () => {
  it('type step, every gender, city locked / unlocked', async () => {
    const parts: string[] = [];
    for (const gender of GENDERS) {
      await open([], gender);
      parts.push(m!.html());
    }
    h.city = false;
    for (const gender of GENDERS) {
      await open([], gender);
      parts.push(m!.html());
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('type'));
  });

  it('info + schedule steps, social vs open groups, every gender', async () => {
    const parts: string[] = [];
    for (const gender of GENDERS) {
      await open(['חברים'], gender);
      parts.push(m!.html());
      await open(['משפחה'], gender);
      parts.push(m!.html());
    }
    await open(['פארק']);
    parts.push(m!.html());
    await m!.type('input', 'ריצת בוקר');
    await m!.clickText('הבא — לוח זמנים');
    parts.push(m!.html());
    await m!.clickText('חודשי');
    parts.push(m!.html());
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('info-schedule'));
  });

  it('invite step: idle, share, whatsapp, skip, create error', async () => {
    const parts: string[] = [];
    const toInvite = async (gender: (typeof GENDERS)[number]) => {
      await open(['חברים'], gender);
      await m!.type('input', 'קבוצה שלי');
      await m!.clickText('הבא — לוח זמנים');
      await m!.clickText('הבא — הזמנת שותפים');
    };
    for (const gender of GENDERS) {
      await toInvite(gender);
      parts.push(m!.html());
    }
    await toInvite('female');
    await m!.clickText('שתפי ופתחי קבוצה');
    await settle();
    parts.push(m!.html() + captured());
    h.opened = [];
    h.shared = [];
    await toInvite('male');
    await m!.clickText('פתח בוואטסאפ');
    await settle();
    parts.push(m!.html() + captured());
    h.createFails = true;
    await toInvite('male');
    await m!.clickText('שתף ופתח קבוצה');
    await settle();
    parts.push(m!.html());
    await toInvite('other');
    await m!.clickText('דילוג');
    await settle();
    parts.push(m!.html());
    h.createFails = false;
    h.opened = [];
    h.shared = [];
    (navigator as unknown as { share: unknown }).share = undefined;
    await toInvite('other');
    await m!.clickText('שיתוף ופתיחת קבוצה');
    await settle();
    parts.push(m!.html() + captured());
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('invite'));
  });

  it('code entry (school / unit), every gender, success, no-code message', async () => {
    const parts: string[] = [];
    for (const gender of GENDERS) {
      await open(['בית ספר'], gender);
      parts.push(m!.html());
      await open(['צבא'], gender);
      parts.push(m!.html());
    }
    await open(['בית ספר'], 'female');
    await m!.clickText('הודעה למורה');
    parts.push(captured());
    h.opened = [];
    await open(['צבא'], 'other');
    await m!.clickText('הודעה למפקד');
    parts.push(captured());
    await m!.clickText('stub-success');
    parts.push(m!.html());
    await open(['צבא'], 'male');
    await m!.clickText('stub-success');
    parts.push(m!.html());
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('code-entry'));
  });

  it('outreach (work / campus), every gender, sent', async () => {
    const parts: string[] = [];
    for (const gender of GENDERS) {
      await open(['עבודה'], gender);
      parts.push(m!.html());
      await open(['קמפוס'], gender);
      parts.push(m!.html());
    }
    for (const [card, gender] of [['עבודה', 'female'], ['קמפוס', 'male'], ['עבודה', 'other']] as const) {
      h.opened = [];
      await open([card], gender);
      await m!.clickText('הודעה ל');
      parts.push(m!.html() + captured());
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('outreach'));
  });
});
