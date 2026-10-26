import { describe, it, expect } from 'vitest';
import { scheduleFailureReason } from '../schedule-diagnostic';
import { summarizeToolResult } from '../turn-engine';

describe('scheduleFailureReason', () => {
  it('keeps the error name and message', () => {
    expect(scheduleFailureReason(new TypeError('bad profile field'))).toBe('TypeError: bad profile field');
  });
  it('masks document paths, uids, emails and long numbers', () => {
    const r = scheduleFailureReason(new Error('no doc userSchedule/nX2AM2HJ79WulFZ2F7jGoA4kDhl1_2026-10-25 for a@b.co.il id 1234567890'));
    expect(r).not.toMatch(/nX2AM2|userSchedule|a@b|1234567890/);
    expect(r).toContain('<path>');
    expect(r).toContain('<email>');
  });
  it('handles a non-Error throw and caps the length', () => {
    expect(scheduleFailureReason('boom')).toBe('Error: boom');
    expect(scheduleFailureReason(new Error('x '.repeat(300))).length).toBeLessThanOrEqual(160);
  });
  it('survives summarizeToolResult truncation inside a partial get_schedule result', () => {
    const content = JSON.stringify({ from: '2026-10-25', to: '2026-10-25', partial: true, diagnostic: scheduleFailureReason(new TypeError('bad profile field')), entries: [{ pad: 'x'.repeat(2000) }] });
    expect(summarizeToolResult('get_schedule', content, false)).toContain('"diagnostic":"TypeError: bad profile field"');
  });
});
