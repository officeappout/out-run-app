/** The flame and shield glyphs of the flames explainer (board ExplainFlames). Static, decorative. */
import { useId } from 'react';
import { STEPS_WALK_COLORS } from '@/components/ui/v2/track-colors';

const FLAME_PATH = 'M12 1.5c.7 3.6 4.4 5.6 5.5 9.4A6.1 6.1 0 0 1 12 23.5a6.1 6.1 0 0 1-6.5-8.1c.6-2.3 1.5-3.8 2.7-5.2.1 1.8 1 3 2.3 3.5-.5-4 .5-7.8 1.5-12.2z';

export function FlameGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 25) / 24} viewBox="0 0 24 25" aria-hidden>
      <path d={FLAME_PATH} fill={STEPS_WALK_COLORS.fill} />
    </svg>
  );
}

export function HeroFlame({ size = 120 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={(size * 128) / 120} viewBox="0 0 24 25" aria-hidden className="relative">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdba74" />
          <stop offset="0.55" stopColor="#f97316" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <path d={FLAME_PATH} fill={`url(#${id})`} />
      <path d="M12 13.5c1.2 1.3 2.1 2.6 2.1 4.1a2.1 2.1 0 0 1-4.2 0c0-1.5.9-2.8 2.1-4.1z" fill="#fed7aa" />
    </svg>
  );
}

export function ShieldGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 23) / 20} viewBox="0 0 24 28" aria-hidden>
      <path d="M12 1.5 21.5 5v8.2c0 6.2-4.1 10.8-9.5 13.3C6.6 24 2.5 19.4 2.5 13.2V5z" fill="#eef8fc" stroke="#00baf7" strokeWidth={2.4} strokeLinejoin="round" />
    </svg>
  );
}
