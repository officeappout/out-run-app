'use client';

import React from 'react';
import { ChevronLeft } from 'lucide-react';

interface DiscoverSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  emptyLabel?: string;
  isEmpty?: boolean;
}

export default function DiscoverSection({
  title,
  icon,
  children,
  emptyLabel = 'אין תוכן להצגה',
  isEmpty,
}: DiscoverSectionProps) {
  if (isEmpty) {
    return null;
  }

  return (
    <section className="space-y-2.5" dir="rtl">
      <div className="flex items-center gap-2 px-1">
        {icon}
        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 flex-1">
          {title}
        </h3>
        <ChevronLeft className="w-4 h-4 text-gray-300 dark:text-gray-600" />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide px-1 -mx-1">
        {React.Children.map(children, (child) => (
          <div className="w-[72vw] max-w-[280px] flex-shrink-0 snap-start">
            {child}
          </div>
        ))}
      </div>
    </section>
  );
}
