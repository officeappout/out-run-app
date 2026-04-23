'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AdminBreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function AdminBreadcrumb({ items }: AdminBreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav dir="rtl" className="flex items-center gap-1 text-sm mb-4">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronLeft size={14} className="text-slate-300 mx-0.5" />}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-cyan-600 hover:text-cyan-800 font-bold transition-colors hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-slate-500 font-medium' : 'text-slate-700 font-bold'}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
