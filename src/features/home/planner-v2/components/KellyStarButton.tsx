'use client';

/**
 * Kelly in the planner header (enable_week_builder_v1; board PL2-kelly #1–2): a round star
 * button beside "הלו״ז שלי". On the first view it opens into the pill "סדר עם קלי" for a few
 * seconds, then folds back (remembered per device). Pure trigger — the caller wires it to
 * KellyWeekLauncher, the one Kelly-over-the-week entry.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { BRAND_GRADIENT } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';

const SEEN_KEY = 'out.plannerV2.kellyPillSeen';
const PILL_MS = 3200;

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode — the pill simply shows again next time */
  }
}

export default function KellyStarButton({ onPress }: { onPress: () => void }) {
  const t = useT(home);
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (readSeen()) return;
    markSeen();
    setExpanded(true);
    const id = setTimeout(() => setExpanded(false), PILL_MS);
    return () => clearTimeout(id);
  }, []);

  return (
    <motion.button
      type="button"
      layout={!reduce}
      onClick={onPress}
      aria-label={t('plannerV2.kelly')}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full text-[14.5px] font-extrabold ${
        expanded ? 'px-3.5 text-v2-ink shadow-v2-card' : 'w-9 bg-white text-v2-accent shadow-v2-ring'
      }`}
      style={expanded ? { background: BRAND_GRADIENT } : undefined}
    >
      <motion.span layout={!reduce ? 'position' : false} className="grid place-items-center">
        <Sparkles size={expanded ? 16 : 18} strokeWidth={2.2} aria-hidden />
      </motion.span>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.span key="label" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {t('plannerV2.kelly')}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
