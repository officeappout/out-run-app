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

import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

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
}

export default function ShimmerPhraseButton({
  messages,
  onTap,
  icon,
  rotateMs = 5000,
  className = 'px-4 pb-3',
}: ShimmerPhraseButtonProps) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMsgIdx(i => (i + 1) % messages.length);
        setVisible(true);
      }, 300);
    }, rotateMs);
    return () => clearInterval(id);
  }, [messages.length, rotateMs]);

  return (
    <div className={`${className} relative`} dir="rtl">
      <style>{`
        @keyframes shimmerBorder {
          0%   { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }
        @keyframes shimmerBorderFast {
          0%   { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }
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
          animation: pressed
            ? 'shimmerBorderFast 1s linear infinite'
            : 'shimmerBorder 5.5s linear infinite',
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
            direction: 'rtl',
          }}
        >
          {icon ?? <Sparkles size={18} color="#00BAF7" strokeWidth={2} style={{ flexShrink: 0 }} />}
          <span
            style={{
              flex: 1,
              fontSize: 15,
              fontWeight: 500,
              color: '#00BAF7',
              textAlign: 'center',
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(5px)',
              transition: visible
                ? 'opacity 0.4s ease, transform 0.4s ease'
                : 'opacity 0.3s ease, transform 0.3s ease',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {messages[msgIdx]}
          </span>
        </div>
      </div>
    </div>
  );
}
