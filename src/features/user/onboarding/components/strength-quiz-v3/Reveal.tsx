'use client';

/**
 * Word-by-word text reveal and a block fade-in for the quiz's explainers (owner 28.10, Y4), the
 * health declaration's look. Reduced motion: everything is there at once.
 */
import { Fragment, type ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { WORD_DURATION_S, WORD_STAGGER_S, splitWords } from './reveal-timing';

const WORD: Variants = {
  hidden: { opacity: 0, y: 5, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: WORD_DURATION_S, ease: 'easeOut' } },
};

type Tag = 'p' | 'h1' | 'span';

export function RevealText({ text, as = 'p', delay = 0, className }: { text: string; as?: Tag; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  const Tag = as;
  if (reduce) return <Tag className={className}>{text}</Tag>;
  const M = motion[as];
  return (
    <M
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { delayChildren: delay, staggerChildren: WORD_STAGGER_S } } }}
    >
      {splitWords(text).map((w, i) => (
        <Fragment key={i}>
          <motion.span variants={WORD} className="inline-block">{w}</motion.span>{' '}
        </Fragment>
      ))}
    </M>
  );
}

export function RevealBlock({ delay = 0, children, className }: { delay?: number; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay, duration: 0.45, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
