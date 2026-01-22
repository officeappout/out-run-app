/**
 * Audio Guidance Service
 * Provides voice announcements for workout events using Web Speech API
 */

let speechSynthesis: SpeechSynthesis | null = null;
let isSupported = false;

// Initialize speech synthesis (SSR-safe)
if (typeof window !== 'undefined') {
  speechSynthesis = window.speechSynthesis;
  isSupported = 'speechSynthesis' in window;
}

/**
 * Announce a message using text-to-speech
 * @param message The message to announce
 * @param lang Language code (default: 'he-IL' for Hebrew)
 */
export function announce(message: string, lang: string = 'he-IL'): void {
  if (!isSupported || !speechSynthesis) {
    console.warn('[AudioGuidance] Speech synthesis not supported');
    return;
  }

  // Cancel any ongoing speech
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = lang;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 0.8;

  speechSynthesis.speak(utterance);
}

/**
 * Announce lap completion with statistics
 * @param lapNumber The completed lap number
 * @param distanceKm Total distance in kilometers
 * @param paceMinutesPerKm Average pace in minutes per kilometer
 */
export function announceLapCompletion(
  lapNumber: number,
  distanceKm: number,
  paceMinutesPerKm: number
): void {
  const paceMinutes = Math.floor(paceMinutesPerKm);
  const paceSeconds = Math.round((paceMinutesPerKm % 1) * 60);
  const paceText = `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')}`;

  const message = `הקפה ${lapNumber} הושלמה. מרחק כולל ${distanceKm.toFixed(2)} קילומטר. קצב ממוצע ${paceText} דקות לקילומטר.`;
  
  announce(message);
}

/**
 * Announce total distance update
 * @param totalDistanceKm Total distance in kilometers
 */
export function announceTotalDistance(totalDistanceKm: number): void {
  const message = `מרחק כולל ${totalDistanceKm.toFixed(2)} קילומטר.`;
  announce(message);
}

/**
 * Stop any ongoing speech
 */
export function stopAnnouncement(): void {
  if (speechSynthesis) {
    speechSynthesis.cancel();
  }
}
