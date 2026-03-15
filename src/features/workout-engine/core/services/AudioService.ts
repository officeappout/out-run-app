/**
 * Audio Service
 * Singleton service for voice guidance using Web Speech API
 */

class AudioService {
  private speechSynthesis: SpeechSynthesis | null = null;
  private isSupported: boolean = false;
  private isUnlocked: boolean = false; // iOS Safari requires user gesture

  constructor() {
    if (typeof window !== 'undefined') {
      this.speechSynthesis = window.speechSynthesis;
      this.isSupported = 'speechSynthesis' in window;
    }
  }

  /**
   * Unlock audio engine (required for iOS Safari)
   * Call this on a user gesture (e.g., button click)
   */
  unlock(): void {
    if (!this.isSupported || !this.speechSynthesis) return;
    
    // Trigger a silent utterance to unlock the audio engine
    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0;
    this.speechSynthesis.speak(utterance);
    this.speechSynthesis.cancel(); // Immediately cancel the silent utterance
    this.isUnlocked = true;
    
    console.log('[AudioService] Audio engine unlocked');
  }

  /**
   * Announce lap completion with statistics
   * @param lapNumber The completed lap number
   * @param distance Distance in kilometers
   * @param pace Pace in minutes per kilometer (e.g., 5.5 = 5:30 min/km)
   * @param time Time in seconds
   */
  announceLap(
    lapNumber: number,
    distance: number,
    pace: number,
    time: number
  ): void {
    if (!this.isSupported || !this.speechSynthesis) {
      console.warn('[AudioService] Speech synthesis not supported');
      return;
    }

    // Cancel any ongoing speech
    this.speechSynthesis.cancel();

    // Format pace: convert minutes per km to "X:XX" format (e.g., 5.5 = 5:30)
    const paceMinutes = Math.floor(pace);
    const paceSeconds = Math.round((pace % 1) * 60);
    const paceText = `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')}`;

    // Construct Hebrew message as requested: "הקפה [מספר] הושלמה. מרחק: [קילומטרים]. קצב: [דקות ושניות]"
    const message = `הקפה ${lapNumber} הושלמה. מרחק: ${distance.toFixed(2)} קילומטר. קצב: ${paceText} דקות לקילומטר.`;

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'he-IL'; // Hebrew (Israel)
    utterance.rate = 1.0; // Natural speed
    utterance.pitch = 1.0; // Natural pitch
    utterance.volume = 0.8; // 80% volume

    this.speechSynthesis.speak(utterance);
    
    console.log('[AudioService] Announcing lap:', message);
  }

  /**
   * Announce a new block during a planned run (e.g., 'מתחילים ריצה קלה').
   */
  announceBlock(blockLabel: string): void {
    this.speak(`מתחילים ${blockLabel}`);
    console.log('[AudioService] Block announcement:', blockLabel);
  }

  /**
   * Announce a pace deviation hint.
   * @param status 'slow' | 'fast'
   */
  announcePaceHint(status: 'slow' | 'fast'): void {
    const message = status === 'slow' ? 'קצב איטי, תאיצו קצת' : 'קצב מהיר, תאטו קצת';
    this.speak(message);
  }

  /**
   * Speak an arbitrary Hebrew message.
   */
  speak(message: string): void {
    if (!this.isSupported || !this.speechSynthesis) return;
    this.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'he-IL';
    utterance.rate = 1.1;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;
    this.speechSynthesis.speak(utterance);
  }

  /**
   * Stop any ongoing speech
   */
  stop(): void {
    if (this.speechSynthesis) {
      this.speechSynthesis.cancel();
    }
  }
}

// Export singleton instance
export const audioService = new AudioService();
