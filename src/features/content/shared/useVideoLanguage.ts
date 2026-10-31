'use client';

import { useLocaleStore } from '@/store/useLocaleStore';
import { contentLanguage } from './content-locale';
import { videoLanguage, type VideoLanguage } from './video-locale';

/** The language exercise tutorials play in. 'he' while enable_video_locale (or the content locale) is off. */
export function useVideoLanguage(): VideoLanguage {
  const locale = useLocaleStore((s) => s.locale);
  const contentOn = useLocaleStore((s) => s.contentLocaleOn);
  const videoOn = useLocaleStore((s) => s.videoLocaleOn);
  return videoLanguage(contentLanguage(locale, contentOn), videoOn);
}

/** Same, read once outside React (plan builders resolve the tutorial when the workout is built). */
export function getVideoLanguage(): VideoLanguage {
  const { locale, contentLocaleOn, videoLocaleOn } = useLocaleStore.getState();
  return videoLanguage(contentLanguage(locale, contentLocaleOn), videoLocaleOn);
}
