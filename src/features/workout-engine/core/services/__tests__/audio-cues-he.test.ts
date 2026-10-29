/**
 * Spoken cues, Hebrew parity: the exact strings and `lang` the audio services produced before the cues
 * moved to the `audio` catalog. Written against origin/main first; must keep passing unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Utt = { text: string; lang: string; rate: number; pitch: number; volume: number; voice?: unknown };
const spoken: Utt[] = [];

beforeEach(() => {
  spoken.length = 0;
  vi.resetModules();
  class FakeUtterance {
    text: string;
    lang = '';
    rate = 1;
    pitch = 1;
    volume = 1;
    voice: unknown;
    constructor(text: string) {
      this.text = text;
    }
  }
  vi.stubGlobal('window', {
    speechSynthesis: { speak: (u: Utt) => spoken.push(u), cancel: () => undefined, getVoices: () => [] },
  });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
});

describe('AudioService (he)', () => {
  it('lap, block, pace hints and speak keep their exact Hebrew text and he-IL', async () => {
    const { audioService } = await import('../AudioService');
    audioService.announceLap(3, 1.2345, 5.5, 330);
    audioService.announceBlock('ריצה קלה');
    audioService.announcePaceHint('slow');
    audioService.announcePaceHint('fast');
    audioService.speak('תתכוננו');
    expect(spoken.map((u) => u.text)).toEqual([
      'הקפה 3 הושלמה. מרחק: 1.23 קילומטר. קצב: 5:30 דקות לקילומטר.',
      'מתחילים ריצה קלה',
      'קצב איטי, תאיצו קצת',
      'קצב מהיר, תאטו קצת',
      'תתכוננו',
    ]);
    expect(spoken.every((u) => u.lang === 'he-IL')).toBe(true);
    expect(spoken[0]).toMatchObject({ rate: 1, pitch: 1, volume: 0.8 });
    expect(spoken[1]).toMatchObject({ rate: 1.1, pitch: 1, volume: 0.9 });
    expect(spoken.every((u) => u.voice === undefined)).toBe(true);
  });
});

describe('audio-guidance.service (he)', () => {
  it('lap completion and total distance keep their exact Hebrew text and he-IL', async () => {
    const g = await import('../audio-guidance.service');
    g.announceLapCompletion(2, 2.5, 6.25);
    g.announceTotalDistance(3.456);
    expect(spoken.map((u) => u.text)).toEqual([
      'הקפה 2 הושלמה. מרחק כולל 2.50 קילומטר. קצב ממוצע 6:15 דקות לקילומטר.',
      'מרחק כולל 3.46 קילומטר.',
    ]);
    expect(spoken.every((u) => u.lang === 'he-IL')).toBe(true);
  });
});
