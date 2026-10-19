/**
 * LifestyleWizard final submit (19.10.2026 audit fix) — the REAL merge write
 * (writeLifestyleWizardCompletion + buildLifestyleWizardFinalWrite) against the
 * REAL firestore.rules: a dual-track user who finishes the wizard through the
 * running branch in a later session (empty onboarding store) keeps their
 * strength days, calendar setting and training history.
 *
 * Run: scripts/ci/run-emulator-suites.sh --only 8089 src/features/user/onboarding/services/__tests__/lifestyle-wizard-submit.emulator.test.ts
 */
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { writeLifestyleWizardCompletion } from '../lifestyle-wizard-submit.service';
import { buildLifestyleWizardFinalWrite } from '../../utils/lifestyle-wizard-final-write';

const PROJECT_ID = 'appout-1-audit-test';
const rules = readFileSync('firestore.rules', 'utf8');
let env: RulesTestEnvironment;

const DUAL = 'dual_track_uid';
const STRENGTH = 'strength_only_uid';
const OTHER = 'other_uid';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', DUAL), {
      core: { name: 'Dual' },
      lifestyle: {
        // strength ב ד + running א ג ה (merged by the running step)
        scheduleDays: ['א', 'ב', 'ג', 'ד', 'ה'],
        trainingHistory: '3+',
        lifestyleTags: ['student', 'goal_skills'],
      },
      settings: { calendarSync: false },
      running: { isUnlocked: true, scheduleDays: ['א', 'ג', 'ה'], scheduleDaysSource: 'user-chosen' },
    });
    await setDoc(doc(db, 'users', STRENGTH), {
      core: { name: 'Strength' },
      lifestyle: { scheduleDays: [] },
    });
    await setDoc(doc(db, 'users', OTHER), { core: { name: 'Other' } });
  });
});

afterAll(async () => {
  if (env) await env.cleanup();
});

const as = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore() as unknown as Firestore;

describe('LifestyleWizard final submit', () => {
  it('running branch, later session (empty store): strength days, calendar and history survive', async () => {
    const write = buildLifestyleWizardFinalWrite({
      strengthScheduleEdited: false,
      editedScheduleDays: undefined, // empty in-memory store in a later session
      historyFrequency: undefined,
      calendarSyncEnabled: undefined,
      sessionLifestyleTags: ['parent', 'busy'],
      goalsSkipped: true,
      existingLifestyleTags: ['student', 'goal_skills'],
      existingRunningScheduleDays: ['א', 'ג', 'ה'],
    });
    await assertSucceeds(writeLifestyleWizardCompletion(as(DUAL), DUAL, ['parent'], write));

    const data = (await getDoc(doc(as(DUAL), 'users', DUAL))).data()!;
    expect(data.lifestyle.scheduleDays).toEqual(['א', 'ב', 'ג', 'ד', 'ה']);
    expect(data.lifestyle.trainingHistory).toBe('3+');
    expect(data.settings.calendarSync).toBe(false);
    expect(data.lifestyle.lifestyleTags).toEqual(['parent', 'busy', 'goal_skills']);
    expect(data.personas.map((p: { id: string }) => p.id)).toEqual(['parent']);
    expect(data.onboardingStatus).toBe('COMPLETED');
    expect(data.onboardingComplete).toBe(true);
    expect(data.running.scheduleDays).toEqual(['א', 'ג', 'ה']);
  });

  it('strength branch edited in this session: writes the chosen days + answers', async () => {
    const write = buildLifestyleWizardFinalWrite({
      strengthScheduleEdited: true,
      editedScheduleDays: ['ב', 'ה'],
      historyFrequency: '1-2',
      calendarSyncEnabled: false,
      sessionLifestyleTags: ['office_worker', 'goal_routine'],
      goalsSkipped: false,
      existingLifestyleTags: undefined,
      existingRunningScheduleDays: undefined,
    });
    await assertSucceeds(writeLifestyleWizardCompletion(as(STRENGTH), STRENGTH, ['office_worker'], write));

    const data = (await getDoc(doc(as(STRENGTH), 'users', STRENGTH))).data()!;
    expect(data.lifestyle.scheduleDays).toEqual(['ב', 'ה']);
    expect(data.lifestyle.trainingHistory).toBe('1-2');
    expect(data.settings.calendarSync).toBe(false);
  });

  it("another user can't write someone else's doc", async () => {
    const write = buildLifestyleWizardFinalWrite({
      strengthScheduleEdited: false,
      editedScheduleDays: undefined,
      historyFrequency: undefined,
      calendarSyncEnabled: undefined,
      sessionLifestyleTags: [],
      goalsSkipped: false,
      existingLifestyleTags: undefined,
      existingRunningScheduleDays: undefined,
    });
    await assertFails(writeLifestyleWizardCompletion(as(OTHER), DUAL, [], write));
  });
});
