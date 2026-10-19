'use client';

import type { ReactNode } from 'react';

interface GroupChipListProps {
  v2: boolean;
  icon: ReactNode;
  title: string;
  items: string[];
  /** Classic (flag-off) chip colours. */
  tone: 'cyan' | 'emerald';
}

const CLASSIC_CHIP = {
  cyan: 'px-2.5 py-1 rounded-full bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 text-xs font-bold',
  emerald: 'px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold',
};

/** A titled row of chips — target muscles / required equipment. */
export default function GroupChipList({ v2, icon, title, items, tone }: GroupChipListProps) {
  return (
    <div>
      <h4 className={v2 ? 'flex items-center gap-1.5 text-[17px] font-black text-v2-ink mb-2' : 'text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5'}>
        {icon}
        {title}
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className={v2 ? 'whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[12.5px] font-extrabold text-v2-ink-2 shadow-v2-ring' : CLASSIC_CHIP[tone]}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
