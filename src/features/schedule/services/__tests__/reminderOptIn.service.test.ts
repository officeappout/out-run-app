import { beforeEach, describe, expect, it, vi } from 'vitest';

const setChannelEnabled = vi.fn(async (..._a: unknown[]) => {});
const setPushEnabled = vi.fn(async (..._a: unknown[]) => {});
const addReminderSlots = vi.fn(async (..._a: unknown[]) => {});
const initPushNotifications = vi.fn(async (..._a: unknown[]) => true);
const setOnboardingPref = vi.fn();
const getOnboardingPrefAsync = vi.fn(async (_k: string): Promise<string | null> => null);

vi.mock('@/features/notifications/services/notification-prefs.service', () => ({
  setChannelEnabled: (...a: unknown[]) => setChannelEnabled(...a),
  setPushEnabled: (...a: unknown[]) => setPushEnabled(...a),
}));
vi.mock('@/features/notifications/services/reminder-schedule.service', () => ({
  addReminderSlots: (...a: unknown[]) => addReminderSlots(...a),
}));
vi.mock('@/lib/native/push', () => ({
  initPushNotifications: (...a: unknown[]) => initPushNotifications(...a),
  isNativePlatform: () => true,
  isIOSDevice: () => false,
  isStandalonePWA: () => false,
  requestWebPush: vi.fn(),
}));
vi.mock('@/lib/onboardingPrefs', () => ({
  setOnboardingPref: (...a: unknown[]) => setOnboardingPref(...a),
  getOnboardingPrefAsync: (k: string) => getOnboardingPrefAsync(k),
}));

import {
  enableRemindersFromReAsk,
  markReAskShown,
  readReAskShownAt,
  recordReminderDeferral,
  saveReminderSkip,
} from '../reminderOptIn.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('saveReminderSkip ("דלג" without the flag)', () => {
  it('mutes ONLY training reminders — never the master switch or other channels', async () => {
    await saveReminderSkip('u1');
    expect(setChannelEnabled).toHaveBeenCalledTimes(1);
    expect(setChannelEnabled).toHaveBeenCalledWith('u1', 'training_reminder', false);
    expect(setPushEnabled).not.toHaveBeenCalled();
  });
  it('no uid → no write; a failed write never throws', async () => {
    await saveReminderSkip('');
    expect(setChannelEnabled).not.toHaveBeenCalled();
    setChannelEnabled.mockRejectedValueOnce(new Error('offline'));
    await expect(saveReminderSkip('u1')).resolves.toBeUndefined();
  });
});

describe('v2 deferral prefs', () => {
  it('records the deferral timestamp under the soft-ask key', () => {
    recordReminderDeferral(1760000000000);
    expect(setOnboardingPref).toHaveBeenCalledWith('push_softask_deferred_at', '1760000000000');
  });
  it('marks / reads the per-moment shown timestamp', async () => {
    markReAskShown('first_workout', 42);
    expect(setOnboardingPref).toHaveBeenCalledWith('push_reask_first_workout_at', '42');
    getOnboardingPrefAsync.mockResolvedValueOnce('42');
    await expect(readReAskShownAt('first_workout')).resolves.toBe(42);
    await expect(readReAskShownAt('first_workout')).resolves.toBeNull();
  });
});

describe('enableRemindersFromReAsk', () => {
  it('OS allowed → push + training reminders on, no slots', async () => {
    initPushNotifications.mockResolvedValueOnce(true);
    await expect(enableRemindersFromReAsk('u1')).resolves.toBe(true);
    expect(initPushNotifications).toHaveBeenCalledWith('u1');
    expect(setPushEnabled).toHaveBeenCalledWith('u1', true);
    expect(setChannelEnabled).toHaveBeenCalledWith('u1', 'training_reminder', true);
    expect(addReminderSlots).not.toHaveBeenCalled();
  });
  it('OS refused → nothing written', async () => {
    initPushNotifications.mockResolvedValueOnce(false);
    await expect(enableRemindersFromReAsk('u1')).resolves.toBe(false);
    expect(setPushEnabled).not.toHaveBeenCalled();
    expect(setChannelEnabled).not.toHaveBeenCalled();
  });
});
