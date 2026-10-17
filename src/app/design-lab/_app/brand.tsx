'use client';

import Link from 'next/link';
import { DotLottieReact, setWasmUrl } from '@lottiefiles/dotlottie-react';
import { MessageCircle, Search } from 'lucide-react';
import { useCompact } from './density';

// Same self-hosted engine as components/ui/AnimatedFlame.tsx.
setWasmUrl('/assets/animations/dotlottie-player.wasm');

export type FlameTone = 'strength' | 'cardio' | 'steps';

/** Per-activity flame colours: rgb for soft washes, hex for solid strokes. */
export const FLAME_TONE: Record<FlameTone, { rgb: string; hex: string; label: string }> = {
  strength: { rgb: '0,186,247', hex: '#00baf7', label: 'כוח' },
  cardio: { rgb: '132,204,22', hex: '#84cc16', label: 'אירובי' },
  steps: { rgb: '249,140,22', hex: '#f59e0b', label: 'צעדים' },
};

const FLAME_SRC: Record<FlameTone, string> = {
  strength: '/design-lab/flame-brand.lottie',
  cardio: '/design-lab/flame-cardio.lottie',
  steps: '/design-lab/flame-steps.lottie',
};

/**
 * The app's streak flame (flame-orange.lottie from LottieFiles), recoloured
 * per activity: strength = brand cyan→turquoise, cardio = lime, steps = amber.
 */
const ORDER: FlameTone[] = ['strength', 'cardio', 'steps'];

/** A day with several activities gets one flame blending their colours. */
function flameSrc(tones: FlameTone[]): string {
  const uniq = ORDER.filter((t) => tones.includes(t));
  if (uniq.length <= 1) return FLAME_SRC[uniq[0] ?? 'strength'];
  return `/design-lab/flame-${uniq.join('-')}.lottie`;
}

export function BrandFlame({
  size = 28,
  still = false,
  tone = 'strength',
  tones,
}: {
  size?: number;
  still?: boolean;
  tone?: FlameTone;
  /** Several activities on one day — overrides `tone`. */
  tones?: FlameTone[];
}) {
  const src = tones && tones.length > 1 ? flameSrc(tones) : FLAME_SRC[tones?.[0] ?? tone];
  return (
    <span className="inline-block shrink-0" style={{ width: size, height: size }} aria-hidden>
      <DotLottieReact key={`${src}-${still}`} src={src} loop={!still} autoplay={!still} style={{ width: size, height: size }} />
    </span>
  );
}

export type LogoMode = 'out' | 'cobrand' | 'city';

/** OUT logotype; with a municipality, either side by side or the city's logo alone. */
export function HeaderLogo({ mode }: { mode: LogoMode }) {
  const out = <img src="/assets/logo/Kind=logotype.svg" alt="OUT" className="h-7 w-auto" />;
  const city = <img src="/design-lab/sderot.png" alt="עיריית שדרות" className="h-8 w-auto max-w-[84px] object-contain" />;
  if (mode === 'out') return out;
  if (mode === 'city') return city;
  return (
    <span dir="ltr" className="flex items-center gap-2.5">
      {city}
      <span className="h-6 w-px bg-v2-hairline" />
      {out}
    </span>
  );
}

/**
 * Home header: avatar with the streak flame on it (right), logo (centre),
 * chat + search (left). Glass bar over the page.
 */
export function AppHeader({ name, streak, logo }: { name: string; streak: number; logo: LogoMode }) {
  const c = useCompact();
  return (
    <header className="v2-glass-bar sticky top-0 z-[4] grid grid-cols-[1fr_auto_1fr] items-center px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+12px)]">
      <span className="flex items-center justify-self-start">
        <span className="relative">
          <span className={`grid ${c ? 'h-10 w-10' : 'h-11 w-11'} place-items-center rounded-full bg-v2-tint text-[17px] font-black text-v2-deep ring-2 ring-white shadow-v2-ring`}>
            {name[0]}
          </span>
          <span className="absolute -bottom-1.5 -start-2 flex items-center rounded-full bg-white pe-1.5 shadow-v2-ring" aria-label={`${streak} ימים ברצף`}>
            <BrandFlame size={28} />
            <span className="text-[12px] font-black tabular-nums text-v2-deep">{streak}</span>
          </span>
        </span>
      </span>
      <Link href="/design-lab/home" className="justify-self-center">
        <HeaderLogo mode={logo} />
      </Link>
      <span className="flex items-center gap-1.5 justify-self-end">
        {[
          { icon: MessageCircle, label: 'הודעות', badge: 2 },
          { icon: Search, label: 'חיפוש' },
        ].map(({ icon: Icon, label, badge }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            className="relative grid h-10 w-10 place-items-center rounded-full bg-white/70 text-v2-ink-2 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <Icon size={19} strokeWidth={2.3} />
            {badge && (
              <span className="absolute -end-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-v2-ink px-1 text-[10.5px] font-black text-white whitespace-nowrap">
                {badge}
              </span>
            )}
          </button>
        ))}
      </span>
    </header>
  );
}
