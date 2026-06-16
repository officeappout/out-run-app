'use client';

import { Kanban, List, BarChart3, Plus, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';

export type CrmSegment = 'authorities' | 'schools' | 'all' | 'hightech';
export type CrmTab = 'board' | 'list' | 'forecast';

interface CrmPageHeaderProps {
  segment: CrmSegment;
  onSegmentChange: (s: CrmSegment) => void;
  activeTab: CrmTab;
  onTabChange: (t: CrmTab) => void;
  draftsCount?: number;
  onScrollToDrafts?: () => void;
}

const SEGMENTS: { key: CrmSegment; label: string; disabled?: boolean }[] = [
  { key: 'authorities', label: 'רשויות' },
  { key: 'schools', label: 'בתי ספר' },
  { key: 'all', label: 'כל הלקוחות' },
  { key: 'hightech', label: 'חברות הייטק', disabled: true },
];

const TABS: { key: CrmTab; icon: React.ElementType; label: string }[] = [
  { key: 'board',    icon: Kanban,        label: 'צנרת' },
  { key: 'list',     icon: List,         label: 'רשימה' },
  { key: 'forecast', icon: BarChart3,    label: 'תחזית' },
];

export default function CrmPageHeader({ segment, onSegmentChange, activeTab, onTabChange, draftsCount = 0, onScrollToDrafts }: CrmPageHeaderProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 pt-4 pb-0">
      {/* Top row: title + segment picker + actions */}
      <div className="flex items-center justify-between mb-4" dir="rtl">
        {/* Left: title + segment switcher */}
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-gray-900">ניהול מכירות (CRM)</span>

          {/* Segment switcher */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1">
            {SEGMENTS.map(s => (
              <button
                key={s.key + s.label}
                disabled={s.disabled}
                onClick={() => !s.disabled && onSegmentChange(s.key)}
                className={[
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  s.disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : segment === s.key && !s.disabled
                    ? 'bg-white text-blue-700 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                {s.label}
                {s.disabled && <span className="mr-1 text-[10px] text-gray-300">בקרוב</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <button
            className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            title="פעולות נוספות"
          >
            <MoreHorizontal size={17} />
          </button>
          <Link
            href="/admin/authorities/new"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            <Plus size={15} />
            רשות חדשה
          </Link>
        </div>
      </div>

      {/* Tab row */}
      <div className="flex items-center justify-between border-b border-gray-100" dir="rtl">
        <div className="flex items-center gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={[
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
                  active
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-400 hover:text-gray-600',
                ].join(' ')}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Drafts badge — visible only when there are pending drafts */}
        {draftsCount > 0 && (
          <button
            onClick={onScrollToDrafts}
            className="flex items-center gap-1.5 mr-3 mb-px px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors"
            title="גלול לטיוטות ממתינות"
          >
            <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
              {draftsCount}
            </span>
            טיוטות ממתינות
          </button>
        )}
      </div>
    </div>
  );
}
