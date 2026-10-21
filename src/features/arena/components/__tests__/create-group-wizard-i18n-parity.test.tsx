/**
 * i18n wave 2 (namespace `community`, prefix `createGroup.*`): the create-group wizard in
 * src/features/arena/components/create-group-wizard. The snapshots below were recorded BEFORE the
 * extraction from unmodified origin/main; the extracted components must render the same Hebrew in
 * every state a static render reaches — v1 and v2 (enable_home_v2, reaching the steps through the
 * WizardV2 context), male / female / unset / non-standard gender (the header + footer's old
 * `t(male, female, gender)` helper), every step, the outreach interstitial (work / campus, sent or
 * not), the success screen (private / public, copied or not) and the edit mode.
 *
 * Static markup (react-dom/server, node env). The step components are rendered directly (the
 * wizard shell needs Firebase / stores / framer-motion presence); their props are unchanged by the
 * extraction. next/dynamic (Mapbox pickers) is replaced by an empty stub; the parks service and
 * the reverse geocoder are mocked (they only run in effects / on a tap).
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text
 * nodes — `יום {day} · {time}` is several nodes before, one `t()` string after; not rendered text).
 *
 * Text behind a tap / async (the submit-error messages set by the hook, the WhatsApp share texts,
 * the reverse-geocode fallback) is pinned by src/lib/i18n/__tests__/community-create-group-he.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/features/admin/services/parks.service', () => ({ getParksByAuthority: () => new Promise(() => {}) }));
vi.mock('@/features/user/onboarding/components/steps/UnifiedLocation/location-utils', () => ({
  reverseGeocode: () => new Promise(() => {}),
}));

import { useLocaleStore } from '@/store/useLocaleStore';
import { WizardV2 } from '../create-group-wizard/wizard-v2';
import { BLANK_FORM } from '../create-group-wizard/wizard-constants';
import type { WizardForm } from '../create-group-wizard/wizard-types';
import { StepType } from '../create-group-wizard/StepType';
import { StepBasics } from '../create-group-wizard/StepBasics';
import { StepMode } from '../create-group-wizard/StepMode';
import { StepOutreach } from '../create-group-wizard/StepOutreach';
import { StepPrivacy } from '../create-group-wizard/StepPrivacy';
import { StepWhenWhere } from '../create-group-wizard/StepWhenWhere';
import { ScheduleSlotsEditor } from '../create-group-wizard/ScheduleSlotsEditor';
import { StepFinalize } from '../create-group-wizard/StepFinalize';
import { WizardHeader } from '../create-group-wizard/WizardHeader';
import { WizardFooter } from '../create-group-wizard/WizardFooter';
import { WizardSuccess } from '../create-group-wizard/WizardSuccess';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/create-group-wizard-i18n/${name}.html`;
const inV = (v2: boolean, el: ReactElement) => <WizardV2.Provider value={v2}>{el}</WizardV2.Provider>;
const form = (patch: Partial<WizardForm> = {}): WizardForm => ({ ...BLANK_FORM, ...patch });
const noop = () => {};
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };
const VERSIONS = [false, true] as const;
const vName = (v2: boolean) => (v2 ? 'v2' : 'v1');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00'));
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS);
});

describe('steps', () => {
  it.each(VERSIONS)('type step (private-by-default type and public type), v2=%s', async (v2) => {
    await expect(html(inV(v2, <StepType form={form({ groupType: 'family' })} updateForm={noop} />))).toMatchFileSnapshot(
      snap(`type-family-${vName(v2)}`),
    );
    await expect(html(inV(v2, <StepType form={form({ groupType: 'neighborhood' })} updateForm={noop} />))).toMatchFileSnapshot(
      snap(`type-neighborhood-${vName(v2)}`),
    );
  });

  it.each(VERSIONS)('basics step (each placeholder, optional category), v2=%s', async (v2) => {
    for (const groupType of ['family', 'friends', 'neighborhood'] as const) {
      for (const hasMeetups of [null, false] as const) {
        const f = form({ groupType, hasMeetups, category: 'walking', name: 'קבוצה', description: 'תיאור' });
        await expect(html(inV(v2, <StepBasics form={f} updateForm={noop} />))).toMatchFileSnapshot(
          snap(`basics-${groupType}-${hasMeetups === false ? 'nomeet' : 'meet'}-${vName(v2)}`),
        );
      }
    }
  });

  it.each(VERSIONS)('mode step, v2=%s', async (v2) => {
    await expect(html(inV(v2, <StepMode form={form({ hasMeetups: true })} updateForm={noop} />))).toMatchFileSnapshot(
      snap(`mode-${vName(v2)}`),
    );
  });

  it.each(VERSIONS)('outreach interstitial (work / campus, sent / not), v2=%s', async (v2) => {
    for (const groupType of ['work', 'university'] as const) {
      for (const sent of [false, true]) {
        await expect(
          html(inV(v2, <StepOutreach groupType={groupType} outreachSent={sent} onSend={noop} onContinue={noop} />)),
        ).toMatchFileSnapshot(snap(`outreach-${groupType}-${sent ? 'sent' : 'unsent'}-${vName(v2)}`));
      }
    }
  });

  it.each(VERSIONS)('privacy step (private default + join requests / public), v2=%s', async (v2) => {
    await expect(
      html(inV(v2, <StepPrivacy form={form({ groupType: 'friends', isPublic: false, allowJoinRequests: true })} updateForm={noop} />)),
    ).toMatchFileSnapshot(snap(`privacy-private-${vName(v2)}`));
    await expect(
      html(inV(v2, <StepPrivacy form={form({ groupType: 'neighborhood', isPublic: true })} updateForm={noop} />)),
    ).toMatchFileSnapshot(snap(`privacy-public-${vName(v2)}`));
  });

  it.each(VERSIONS)('when & where step (no authority / authority, pin / no pin, slots), v2=%s', async (v2) => {
    const props = {
      updateForm: noop,
      hasRealAnchor: false,
      slotDay: 2,
      slotTime: '18:30',
      setSlotDay: noop,
      setSlotTime: noop,
      addSlot: noop,
      removeSlot: noop,
    };
    await expect(html(inV(v2, <StepWhenWhere {...props} form={form()} authorityId="" />))).toMatchFileSnapshot(
      snap(`whenwhere-noauth-${vName(v2)}`),
    );
    const placed = form({
      locationSelected: true,
      address: 'פארק הירקון',
      scheduleSlots: [{ dayOfWeek: 0, time: '07:00' }, { dayOfWeek: 6, time: '19:30' }] as WizardForm['scheduleSlots'],
    });
    await expect(html(inV(v2, <StepWhenWhere {...props} form={placed} authorityId="tlv" />))).toMatchFileSnapshot(
      snap(`whenwhere-placed-${vName(v2)}`),
    );
  });

  it.each(VERSIONS)('schedule editor (every weekday in a slot), v2=%s', async (v2) => {
    const slots = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, time: `1${d}:00` })) as WizardForm['scheduleSlots'];
    await expect(
      html(
        inV(
          v2,
          <ScheduleSlotsEditor
            scheduleSlots={slots}
            slotDay={0}
            slotTime=""
            setSlotDay={noop}
            setSlotTime={noop}
            addSlot={noop}
            removeSlot={noop}
          />,
        ),
      ),
    ).toMatchFileSnapshot(snap(`slots-${vName(v2)}`));
  });

  it.each(VERSIONS)('finalize step (empty / filled / error), v2=%s', async (v2) => {
    const ref = { current: null };
    await expect(
      html(inV(v2, <StepFinalize form={form()} fileInputRef={ref} onImagePick={noop} submitError={null} />)),
    ).toMatchFileSnapshot(snap(`finalize-empty-${vName(v2)}`));
    const filled = form({
      name: 'רצים בפארק',
      category: 'cycling',
      address: 'פארק הירקון, תל אביב, ישראל',
      isPublic: false,
      imagePreviewUrl: 'blob:x',
      scheduleSlots: [{ dayOfWeek: 1, time: '08:00' }, { dayOfWeek: 3, time: '08:00' }] as WizardForm['scheduleSlots'],
    });
    await expect(
      html(inV(v2, <StepFinalize form={filled} fileInputRef={ref} onImagePick={noop} submitError="יצירת הקבוצה נכשלה. נסה שוב." />)),
    ).toMatchFileSnapshot(snap(`finalize-filled-${vName(v2)}`));
    for (const category of ['running', 'calisthenics', 'yoga', 'other'] as const) {
      await expect(
        html(inV(v2, <StepFinalize form={form({ category, isPublic: true, name: 'x' })} fileInputRef={ref} onImagePick={noop} submitError={null} />)),
      ).toMatchFileSnapshot(snap(`finalize-${category}-${vName(v2)}`));
    }
  });
});

describe('chrome', () => {
  const GENDERS = ['female', 'male', null, 'x'] as const;
  const gName = (g: string | null) => g ?? 'unset';

  it.each(VERSIONS)('header — every step, outreach, edit, success, each gender, v2=%s', async (v2) => {
    for (const myGender of GENDERS) {
      for (const isEditMode of [false, true]) {
        await expect(
          html(
            <WizardHeader v2={v2} successInfo={null} isEditMode={isEditMode} myGender={myGender} step={0} outreachMode={null} handleClose={noop} />,
          ),
        ).toMatchFileSnapshot(snap(`header-${isEditMode ? 'edit' : 'create'}-${gName(myGender)}-${vName(v2)}`));
      }
    }
    for (const step of [1, 2, 3, 4, 5]) {
      await expect(
        html(<WizardHeader v2={v2} successInfo={null} isEditMode={false} myGender="male" step={step} outreachMode={null} handleClose={noop} />),
      ).toMatchFileSnapshot(snap(`header-step${step}-${vName(v2)}`));
    }
    await expect(
      html(<WizardHeader v2={v2} successInfo={null} isEditMode={false} myGender="male" step={0} outreachMode="outreach" handleClose={noop} />),
    ).toMatchFileSnapshot(snap(`header-outreach-${vName(v2)}`));
    await expect(
      html(
        <WizardHeader
          v2={v2}
          successInfo={{ groupId: 'g', inviteCode: 'ABC123', name: 'x', isPrivate: true }}
          isEditMode={false}
          myGender="female"
          step={5}
          outreachMode={null}
          handleClose={noop}
        />,
      ),
    ).toMatchFileSnapshot(snap(`header-success-${vName(v2)}`));
  });

  it.each(VERSIONS)('footer — next, outreach, create / save per gender, location hint, v2=%s', async (v2) => {
    const base = {
      v2,
      form: form({ name: 'קבוצה' }),
      submitting: false,
      isEditMode: false,
      myGender: 'male' as string | null,
      canAdvance: () => true,
      handleBack: noop,
      handleNext: noop,
      handleCreate: noop,
    };
    await expect(html(<WizardFooter {...base} step={1} outreachMode={null} />)).toMatchFileSnapshot(snap(`footer-next-${vName(v2)}`));
    await expect(html(<WizardFooter {...base} step={0} outreachMode="outreach" />)).toMatchFileSnapshot(
      snap(`footer-outreach-${vName(v2)}`),
    );
    await expect(
      html(<WizardFooter {...base} step={3} outreachMode={null} form={form({ hasMeetups: true, groupType: 'neighborhood' })} />),
    ).toMatchFileSnapshot(snap(`footer-location-hint-${vName(v2)}`));
    for (const myGender of GENDERS) {
      for (const isEditMode of [false, true]) {
        await expect(
          html(<WizardFooter {...base} step={5} outreachMode={null} myGender={myGender} isEditMode={isEditMode} />),
        ).toMatchFileSnapshot(snap(`footer-${isEditMode ? 'save' : 'create'}-${gName(myGender)}-${vName(v2)}`));
      }
    }
  });

  it.each(VERSIONS)('success screen — private (copied / not) and public, v2=%s', async (v2) => {
    for (const isPrivate of [true, false]) {
      for (const codeCopied of [false, true]) {
        await expect(
          html(
            <WizardSuccess
              v2={v2}
              successInfo={{ groupId: 'g', inviteCode: 'ABC123', name: 'x', isPrivate }}
              codeCopied={codeCopied}
              copySuccessCode={noop}
              shareSuccessCode={noop}
              enterCreatedCommunity={noop}
            />,
          ),
        ).toMatchFileSnapshot(snap(`success-${isPrivate ? 'private' : 'public'}-${codeCopied ? 'copied' : 'idle'}-${vName(v2)}`));
      }
    }
  });
});
