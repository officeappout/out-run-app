/**
 * Lightweight confetti burst for onboarding phase completions.
 * Uses canvas-confetti (already installed).
 */
export async function firePhaseConfetti(): Promise<void> {
  try {
    const confetti = (await import('canvas-confetti')).default;

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.25 },
      colors: ['#10B981', '#34D399', '#5BC2F2', '#00C9F2', '#fbbf24'],
      ticks: 100,
      gravity: 1.1,
      scalar: 0.85,
    });

    setTimeout(() => {
      confetti({
        particleCount: 25,
        spread: 80,
        origin: { y: 0.3, x: 0.55 },
        colors: ['#10B981', '#34D399', '#5BC2F2'],
        ticks: 80,
        gravity: 1.3,
        scalar: 0.7,
      });
    }, 200);
  } catch {
    // canvas-confetti not available — no-op
  }
}
