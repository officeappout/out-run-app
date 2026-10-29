import { describe, it, expect, beforeEach } from 'vitest';
import { clipKey, clipMuted, clipResumeTime, clearClipTimes, rememberClipTime } from '../clip-playback';

describe('clipMuted (pilot M17)', () => {
  it('keeps today: reps/time clips muted, follow-along follows the legacy toggle', () => {
    expect(clipMuted({ exerciseType: 'reps', legacyAudioEnabled: true, withSound: false, sessionMuted: false })).toBe(true);
    expect(clipMuted({ exerciseType: 'time', legacyAudioEnabled: true, withSound: false, sessionMuted: false })).toBe(true);
    expect(clipMuted({ exerciseType: 'follow-along', legacyAudioEnabled: true, withSound: false, sessionMuted: true })).toBe(false);
    expect(clipMuted({ exerciseType: 'follow-along', legacyAudioEnabled: false, withSound: false, sessionMuted: false })).toBe(true);
  });

  it('station clip: sound on unless the session mute is on', () => {
    expect(clipMuted({ exerciseType: 'reps', legacyAudioEnabled: false, withSound: true, sessionMuted: false })).toBe(false);
    expect(clipMuted({ exerciseType: 'reps', legacyAudioEnabled: false, withSound: true, sessionMuted: true })).toBe(true);
  });
});

describe('clip resume (pilot M14/M17: remount per tabata interval)', () => {
  beforeEach(() => clearClipTimes());

  it('starts at 0 when nothing was played', () => {
    expect(clipResumeTime('v1', 60)).toBe(0);
  });

  it('resumes where the previous mount stopped', () => {
    rememberClipTime('v1', 19.6);
    expect(clipResumeTime('v1', 60)).toBe(19.6);
    expect(clipResumeTime('v2', 60)).toBe(0);
  });

  it('starts over at the end, or when the length is unknown', () => {
    rememberClipTime('v1', 59.5);
    expect(clipResumeTime('v1', 60)).toBe(0);
    rememberClipTime('v1', 10);
    expect(clipResumeTime('v1', NaN)).toBe(0);
  });

  it('ignores bad times', () => {
    rememberClipTime('v1', -3);
    rememberClipTime('', 5);
    expect(clipResumeTime('v1', 60)).toBe(0);
  });

  it('keys by the video, so the rest preview and the active set share a position', () => {
    expect(clipKey('abc', 'https://x/play_360p.mp4')).toBe('abc');
    expect(clipKey(null, 'https://x/a.mp4')).toBe('https://x/a.mp4');
    expect(clipKey(null, null)).toBeNull();
  });
});
