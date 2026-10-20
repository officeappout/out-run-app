import { describe, expect, it } from 'vitest';
import { isReminderAlreadyActive, reminderPreviewTitle, reminderSlotsFor } from '../reminderOptIn';

describe('reminderSlotsFor', () => {
  it('one slot per workout at time − lead', () => {
    expect(reminderSlotsFor([{ dow: 0, time: '19:00' }, { dow: 5, time: '07:00' }], 30)).toEqual([
      { day: 'sunday', time: '18:30' },
      { day: 'friday', time: '06:30' },
    ]);
  });
  it('an hour before', () => {
    expect(reminderSlotsFor([{ dow: 2, time: '12:30' }], 60)).toEqual([{ day: 'tuesday', time: '11:30' }]);
  });
  it('floors to the 5-minute grid', () => {
    expect(reminderSlotsFor([{ dow: 1, time: '07:03' }], 15)).toEqual([{ day: 'monday', time: '06:45' }]);
  });
  it('crossing midnight lands on the previous day', () => {
    expect(reminderSlotsFor([{ dow: 0, time: '00:15' }], 30)).toEqual([{ day: 'saturday', time: '23:45' }]);
  });
  it('skips bad input and dedupes', () => {
    expect(reminderSlotsFor([{ dow: 1, time: 'x' }, { dow: 9, time: '07:00' }], 15)).toEqual([]);
    expect(reminderSlotsFor([{ dow: 1, time: '07:00' }, { dow: 1, time: '07:00' }], 15)).toHaveLength(1);
  });
});

describe('isReminderAlreadyActive', () => {
  it('needs OS permission AND an explicit push on, without muted training reminders', () => {
    expect(isReminderAlreadyActive({ permission: 'granted', pushEnabled: true, trainingReminder: undefined })).toBe(true);
    expect(isReminderAlreadyActive({ permission: 'granted', pushEnabled: undefined, trainingReminder: true })).toBe(false);
    expect(isReminderAlreadyActive({ permission: 'prompt', pushEnabled: true, trainingReminder: true })).toBe(false);
    expect(isReminderAlreadyActive({ permission: 'granted', pushEnabled: true, trainingReminder: false })).toBe(false);
  });
});

describe('reminderPreviewTitle', () => {
  it('words the lead', () => {
    expect(reminderPreviewTitle(30, 'ריצה קלה', '19:00')).toBe('עוד 30 דק׳: ריצה קלה · 19:00');
    expect(reminderPreviewTitle(60, 'אימון איכות', '07:00')).toBe('עוד שעה: אימון איכות · 07:00');
  });
});
