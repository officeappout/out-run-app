'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ExpandableTextProps {
  text: string;
  maxLines?: number;
  className?: string;
}

/**
 * ExpandableText - Component for displaying text that can be expanded/collapsed
 * Shows a "קרא עוד..." / "הצג פחות" button when text exceeds maxLines
 */
export default function ExpandableText({
  text,
  maxLines = 3,
  className = '',
}: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // Check if text needs expansion (exceeds maxLines)
  useEffect(() => {
    if (textRef.current) {
      // When line-clamp is applied, scrollHeight > clientHeight means text is truncated
      const isTruncated = textRef.current.scrollHeight > textRef.current.clientHeight;
      setNeedsExpansion(isTruncated);
    }
  }, [text, maxLines]);

  if (!text) return null;

  // Get the line-clamp class based on maxLines
  const lineClampClass = maxLines === 3 ? 'line-clamp-3' : maxLines === 2 ? 'line-clamp-2' : 'line-clamp-4';

  return (
    <div className={className} dir="rtl">
      <motion.div
        initial={false}
        animate={{
          height: isExpanded ? 'auto' : undefined,
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <p
          ref={textRef}
          className={`text-slate-600 dark:text-slate-400 text-sm leading-relaxed text-right ${
            !isExpanded ? lineClampClass : ''
          }`}
        >
          {text}
        </p>
      </motion.div>

      {needsExpansion && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-[#00ADEF] hover:text-[#0099D6] text-sm font-medium flex items-center gap-1 transition-colors"
          aria-label={isExpanded ? 'הצג פחות' : 'קרא עוד'}
        >
          {isExpanded ? (
            <>
              <span>הצג פחות</span>
              <ChevronUp size={16} />
            </>
          ) : (
            <>
              <span>קרא עוד...</span>
              <ChevronDown size={16} />
            </>
          )}
        </button>
      )}
    </div>
  );
}
