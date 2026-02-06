'use client';

import { useState, ReactNode } from 'react';
import { ChevronDown, LucideIcon } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconBgColor?: string;
  iconColor?: string;
  borderColor?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
  badge?: ReactNode;
}

export default function CollapsibleSection({
  title,
  subtitle,
  icon: Icon,
  iconBgColor = 'bg-purple-100',
  iconColor = 'text-purple-700',
  borderColor = 'border-purple-500',
  defaultExpanded = false,
  children,
  badge,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between p-5 text-left transition-colors hover:bg-gray-50 ${
          isExpanded ? 'border-b border-gray-100' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={`p-2 ${iconBgColor} rounded-lg`}>
              <Icon size={20} className={iconColor} />
            </div>
          )}
          {!Icon && (
            <span className={`w-1 h-6 ${borderColor.replace('border-', 'bg-')} rounded-full`}></span>
          )}
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              {title}
              {badge}
            </h2>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
          <ChevronDown size={20} className="text-gray-400" />
        </div>
      </button>

      {/* Collapsible Content */}
      <div
        className={`transition-all duration-300 overflow-hidden ${
          isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-5 pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}
