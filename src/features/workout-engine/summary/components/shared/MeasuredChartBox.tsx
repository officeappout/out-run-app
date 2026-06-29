'use client';

import { useRef, useState, useEffect, type ReactNode } from 'react';

export default function MeasuredChartBox({
  children,
  className,
}: {
  children: (size: { width: number; height: number }) => ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          setSize((prev) =>
            prev && prev.width === width && prev.height === height
              ? prev
              : { width, height },
          );
        });
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {size ? children(size) : null}
    </div>
  );
}
