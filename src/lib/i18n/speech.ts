/**
 * Spoken cues follow the UI locale: the cue text comes from the `audio` catalog (makeLiveT reads the active
 * locale at call time) and the TTS language from here. Hebrew keeps `he-IL` and no explicit voice, exactly as before.
 */
import { useLocaleStore } from '@/store/useLocaleStore';
import { ensureCatalog } from './catalogs';
import { makeLiveT } from './live-t';
import { SOURCE_LOCALE, type Locale } from './locales';
import { audio } from '@/messages/ns/audio';

export const speechT = makeLiveT(audio);

// ru/de have no audio catalog yet (their text falls back to en), so they speak English: lang must match the spoken text.
const TTS_LANG: Record<Locale, string> = { he: 'he-IL', en: 'en-US', ru: 'en-US', de: 'en-US' };

export function ttsLangFor(locale: Locale): string {
  return TTS_LANG[locale] ?? TTS_LANG[SOURCE_LOCALE];
}

/** Loads the audio catalog for the active locale (call when a run/workout session starts) so the first cue is not Hebrew text. */
export function prewarmSpeech(): Promise<void> {
  const { locale } = useLocaleStore.getState();
  return locale === SOURCE_LOCALE ? Promise.resolve() : ensureCatalog(locale, audio.name);
}

export function currentTtsLang(): string {
  return ttsLangFor(useLocaleStore.getState().locale);
}

/**
 * A voice for `lang`: exact match, then same primary language. Undefined when the device has none, so the
 * utterance keeps `lang` and the engine's default applies (never a Hebrew voice reading English).
 */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const norm = (l: string) => l.replace('_', '-').toLowerCase();
  const want = norm(lang);
  const primary = want.split('-')[0];
  return (
    voices.find((v) => norm(v.lang) === want) ?? voices.find((v) => norm(v.lang).split('-')[0] === primary)
  );
}

/** Applies lang (and, outside Hebrew, a matching voice when one exists) to an utterance. */
export function applySpeechLang(utterance: SpeechSynthesisUtterance, synth: SpeechSynthesis | null, lang: string): void {
  utterance.lang = lang;
  if (lang === TTS_LANG[SOURCE_LOCALE] || !synth || typeof synth.getVoices !== 'function') return;
  const voice = pickVoice(synth.getVoices(), lang);
  if (voice) utterance.voice = voice;
}
