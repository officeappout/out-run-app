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

describe('spoken cues follow the locale (en)', () => {
  it('English text, en-US, and a matching voice when the device has one', async () => {
    const { registerCatalog } = await import('@/lib/i18n/catalogs');
    const en = (await import('@/messages/en/audio.json')).default;
    const { useLocaleStore } = await import('@/store/useLocaleStore');
    registerCatalog('en', 'audio', en);
    const voice = { lang: 'en_GB', name: 'x' };
    (globalThis as unknown as { window: { speechSynthesis: { getVoices: () => unknown[] } } }).window.speechSynthesis.getVoices = () => [
      { lang: 'he-IL' },
      voice,
    ];
    useLocaleStore.getState().setLocaleState({ locale: 'en' });
    const { audioService } = await import('../AudioService');
    audioService.announceLap(3, 1.2345, 5.5, 330);
    audioService.announcePaceHint('slow');
    audioService.announceGetReady();
    expect(spoken.map((u) => u.text)).toEqual([
      'Lap 3 complete. Distance: 1.23 kilometers. Pace: 5:30 minutes per kilometer.',
      'Pace is slow, pick it up a little',
      'Get ready',
    ]);
    expect(spoken.every((u) => u.lang === 'en-US' && u.voice === voice)).toBe(true);
    useLocaleStore.getState().setLocaleState({ locale: 'he' });
  });

  it('no English voice: keeps lang en-US, sets no voice', async () => {
    const { registerCatalog } = await import('@/lib/i18n/catalogs');
    registerCatalog('en', 'audio', (await import('@/messages/en/audio.json')).default);
    const { useLocaleStore } = await import('@/store/useLocaleStore');
    useLocaleStore.getState().setLocaleState({ locale: 'en' });
    const { audioService } = await import('../AudioService');
    audioService.speak('hi');
    expect(spoken[0].lang).toBe('en-US');
    expect(spoken[0].voice).toBeUndefined();
    useLocaleStore.getState().setLocaleState({ locale: 'he' });
  });
});

describe('speech language and prewarm', () => {
  it('ru/de speak English text with en-US; he stays he-IL', async () => {
    const { ttsLangFor } = await import('@/lib/i18n/speech');
    expect([ttsLangFor('he'), ttsLangFor('en'), ttsLangFor('ru'), ttsLangFor('de')]).toEqual(['he-IL', 'en-US', 'en-US', 'en-US']);
  });

  it('unlock() loads the audio catalog so the first cue is English', async () => {
    const { useLocaleStore } = await import('@/store/useLocaleStore');
    const catalogs = await import('@/lib/i18n/catalogs');
    useLocaleStore.getState().setLocaleState({ locale: 'en' });
    const spy = vi.spyOn(catalogs, 'ensureCatalog').mockResolvedValue();
    const { audioService } = await import('../AudioService');
    audioService.unlock();
    expect(spy).toHaveBeenCalledWith('en', 'audio');
    useLocaleStore.getState().setLocaleState({ locale: 'he' });
  });
});
