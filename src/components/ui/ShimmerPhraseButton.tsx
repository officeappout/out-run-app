'use client';

/**
 * ShimmerPhraseButton — a reusable pill CTA with a shimmering gradient border,
 * ambient glow, and a rotating phrase that fades between messages.
 *
 * Extracted verbatim from the home carousel's "build custom" button so the
 * chrome lives in ONE place. Consumers pass their own resolved `messages`:
 *   • home (`BuildCustomButton`) → gendered "בנה אימון" phrases
 *   • hybrid slot entry           → "מה עושים היום? ✨" phrases
 *
 * Presentational only — no domain coupling.
 */

import { useState, useEffect, type CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import { useUiDir } from '@/lib/i18n/useUiDir';

interface ShimmerPhraseButtonProps {
  /** Rotating phrases (already resolved by the caller, e.g. gendered). */
  messages: string[];
  onTap: () => void;
  /** Leading icon — defaults to a cyan Sparkles. */
  icon?: React.ReactNode;
  /** Phrase rotation interval, ms. */
  rotateMs?: number;
  /** Outer wrapper classes (padding/positioning). */
  className?: string;
  /**
   * Pilot AJ7: the next phrase fades in over the previous one, so the pill is never
   * blank between phrases (the default fades out to empty, then in).
   */
  crossfade?: boolean;
}

const CROSSFADE_KEYFRAMES = `
        @keyframes phraseIn {
          0%   { opacity: 0; transform: translateY(5px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes phraseOut {
          0%   { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-5px); }
        }`;

export default function ShimmerPhraseButton({
  messages,
  onTap,
  icon,
  rotateMs = 5000,
  className = 'px-4 pb-3',
  crossfade = false,
}: ShimmerPhraseButtonProps) {
  const { direction: uiDir } = useUiDir();
  const [msgIdx, setMsgIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const [pressed, setPressed] = useState(false);
  const { direction, isRtl } = useUiDir();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!crossfade || messages.length <= 1) return;
    const id = setInterval(() => setTick((n) => n + 1), rotateMs);
    return () => clearInterval(id);
  }, [crossfade, messages.length, rotateMs]);

  useEffect(() => {
    if (crossfade || messages.length <= 1) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMsgIdx(i => (i + 1) % messages.length);
        setVisible(true);
      }, 300);
    }, rotateMs);
    return () => clearInterval(id);
  }, [crossfade, messages.length, rotateMs]);

  const phraseStyle: CSSProperties = {
    fontSize: 15,
    fontWeight: 500,
    color: '#007EA8',
    textAlign: 'center',
    ...(isRtl
      ? { whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }
      : // Longer English phrases wrap to 2 lines instead of truncating.
        {
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical' as const,
          WebkitLineClamp: 2,
          lineHeight: 1.25,
          textWrap: 'balance' as const,
        }),
  };
  const n = messages.length;

  return (
    <div className={`${className} relative`} dir={direction}>
      <style>{`
        @keyframes shimmerBorder {
          0%   { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }
        @keyframes shimmerBorderFast {
          0%   { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }${crossfade ? CROSSFADE_KEYFRAMES : ''}
      `}</style>

      {/* Ambient glow — brand-colored radial blur behind the button */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 50% 60%, rgba(0,186,247,0.22) 0%, rgba(12,242,227,0.14) 50%, transparent 80%)',
          filter: 'blur(20px)',
          zIndex: 0,
        }}
      />

      {/* Gradient border wrapper */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: 2,
          borderRadius: 50,
          background: 'linear-gradient(90deg, #00BAF7, #0CF2E3, #00BAF7, #0CF2E3)',
          backgroundSize: '300% 100%',
          // Idle-state shimmer capped at 3 cycles (SPEC-05 A2.2), not
          // infinite — this is a background-position animation, which
          // forces a repaint on every frame (not just compositing, unlike
          // a transform/opacity animation), and this button sits on the
          // map's default DiscoverLayer, running continuously any time the
          // idle map is open. After the 3rd cycle it settles at its base
          // background-position — same gradient, same element, just static.
          // shimmerBorderFast (press feedback) stays infinite: it can only
          // ever run while a pointer is physically held down on the
          // button, so it cannot contribute to idle heat, and capping it
          // would risk the border visibly freezing mid-shimmer during an
          // unusually long press for no heat benefit.
          animation: pressed
            ? 'shimmerBorderFast 1s linear infinite'
            : 'shimmerBorder 5.5s linear 3',
          transform: pressed ? 'scale(0.97)' : 'scale(1)',
          boxShadow: pressed ? '0 0 14px rgba(0,186,247,0.35)' : 'none',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        }}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => { setPressed(false); onTap(); }}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
      >
        {/* Inner transparent surface */}
        <div
          style={{
            borderRadius: 48,
            background: 'white',
            padding: '14px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            minHeight: 52,
            direction: uiDir,
          }}
        >
          {icon ?? <Sparkles size={18} color="#007EA8" strokeWidth={2} style={{ flexShrink: 0 }} />}
          {crossfade && n > 1 ? (
            <span style={{ flex: 1, display: 'grid', minWidth: 0 }}>
              {tick > 0 && (
                <span key={`out-${tick}`} aria-hidden style={{ ...phraseStyle, gridArea: '1 / 1', animation: 'phraseOut 0.35s ease forwards' }}>
                  {messages[(tick - 1) % n]}
                </span>
              )}
              <span key={`in-${tick}`} style={{ ...phraseStyle, gridArea: '1 / 1', animation: tick > 0 ? 'phraseIn 0.4s ease both' : undefined }}>
                {messages[tick % n]}
              </span>
            </span>
          ) : (
            <span
              style={{
                flex: 1,
                fontSize: 15,
                fontWeight: 500,
                color: '#007EA8',
                textAlign: 'center',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(5px)',
                transition: visible
                  ? 'opacity 0.4s ease, transform 0.4s ease'
                  : 'opacity 0.3s ease, transform 0.3s ease',
                ...(isRtl
                  ? { whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }
                  : // Longer English phrases wrap to 2 lines instead of truncating.
                    {
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical' as const,
                      WebkitLineClamp: 2,
                      lineHeight: 1.25,
                      textWrap: 'balance' as const,
                    }),
              }}
            >
              {messages[msgIdx]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
