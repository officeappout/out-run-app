import { describe, expect, it } from 'vitest';
import { parseGenerateRequest } from '../api-contract';

const start = { lat: 32.0779, lng: 34.774 };

describe('POST /api/routes/generate body', () => {
  it('loop: defaults mode/seed/maxResults, clamps them', () => {
    expect(parseGenerateRequest({ start, targetKm: 5, activity: 'running' })).toEqual({ mode: 'loop', start, targetKm: 5, activity: 'running', seed: 0, maxResults: 3 });
    expect(parseGenerateRequest({ mode: 'loop', start, targetKm: 5, activity: 'walking', seed: -1_000_000_007.8, maxResults: 9 }))
      .toMatchObject({ seed: 7, maxResults: 3 });
  });
  it('rejects outside Israel, bad targets, unknown activity/mode', () => {
    expect(parseGenerateRequest({ start: { lat: 48.85, lng: 2.35 }, targetKm: 5, activity: 'running' })).toEqual({ error: 'bad_start' });
    expect(parseGenerateRequest({ start, targetKm: 0.5, activity: 'running' })).toEqual({ error: 'bad_target' });
    expect(parseGenerateRequest({ start, targetKm: 45, activity: 'running' })).toEqual({ error: 'bad_target' });
    expect(parseGenerateRequest({ start, targetKm: 45, activity: 'cycling' })).toMatchObject({ mode: 'loop' });
    expect(parseGenerateRequest({ start, targetKm: '5', activity: 'running' })).toEqual({ error: 'bad_target' });
    expect(parseGenerateRequest({ start, targetKm: 5, activity: 'workout' })).toEqual({ error: 'bad_activity' });
    expect(parseGenerateRequest({ start, targetKm: 5, activity: 'running', mode: 'x' })).toEqual({ error: 'bad_mode' });
    expect(parseGenerateRequest(null)).toEqual({ error: 'bad_activity' });
  });
  it('ab: needs both points', () => {
    expect(parseGenerateRequest({ mode: 'ab', from: start, to: { lat: 32.0571, lng: 34.7687 }, activity: 'walking' })).toMatchObject({ mode: 'ab' });
    expect(parseGenerateRequest({ mode: 'ab', from: start, activity: 'walking' })).toEqual({ error: 'bad_points' });
  });
});
