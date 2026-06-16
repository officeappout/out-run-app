'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { Authority } from '@/types/admin-types';
import type { StatCardFilterKey } from '@/features/admin/components/authorities/AuthoritiesStatsDashboard';

interface KpiBarProps {
  authorities: Authority[];
  activeStatFilter: StatCardFilterKey | null;
  onStatCardFilter: (key: StatCardFilterKey | null) => void;
  showFull: boolean;
  onToggleFull: () => void;
  renderFullDashboard: () => React.ReactNode;
}

interface KpiTile {
  key: StatCardFilterKey;
  label: string;
  value: string;
  subValue?: string;
  accent: string;   // Tailwind text-color
  bgActive: string; // Tailwind bg when active
}

const SALES_STAGES = ['meeting', 'quote', 'follow_up', 'closing'];

function fmt(n: number): string {
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₪${(n / 1_000).toFixed(0)}K`;
  return `₪${n.toLocaleString()}`;
}

export default function KpiBar({
  authorities,
  activeStatFilter,
  onStatCardFilter,
  showFull,
  onToggleFull,
  renderFullDashboard,
}: KpiBarProps) {
  const topLevel = useMemo(
    () => authorities.filter(a => !a.parentAuthorityId && !a.id.includes('__SCHEMA_INIT__')),
    [authorities]
  );

  const tiles = useMemo<KpiTile[]>(() => {
    const yr = String(new Date().getFullYear());

    const pipelineValue = topLevel
      .filter(a => !a.isActiveClient && SALES_STAGES.includes(a.pipelineStatus || 'lead'))
      .reduce((s, a) => s + (a.financials?.totalQuoteAmount || 0), 0);

    const annualRevenue = topLevel.reduce((s, a) =>
      s + (a.financials?.installments?.filter(i => i.targetMonth?.startsWith(yr))
        .reduce((ss, i) => ss + i.amount, 0) || 0), 0);

    const activeCount = topLevel.filter(a => a.isActiveClient).length;
    const closingSoonCount = topLevel.filter(a =>
      ['follow_up', 'closing'].includes(a.pipelineStatus || '')
    ).length;

    return [
      {
        key: 'pipelineValue',
        label: 'שווי צנרת',
        value: fmt(pipelineValue),
        accent: 'text-blue-700',
        bgActive: 'bg-blue-50 border-blue-200',
      },
      {
        key: 'annualRevenue',
        label: `הכנסה ${yr}`,
        value: fmt(annualRevenue),
        accent: 'text-emerald-700',
        bgActive: 'bg-emerald-50 border-emerald-200',
      },
      {
        key: 'activeClients',
        label: 'לקוחות פעילים',
        value: String(activeCount),
        accent: 'text-green-700',
        bgActive: 'bg-green-50 border-green-200',
      },
      {
        key: 'closingSoon',
        label: 'קרובים לסגירה',
        value: String(closingSoonCount),
        accent: 'text-orange-700',
        bgActive: 'bg-orange-50 border-orange-200',
      },
    ];
  }, [topLevel]);

  return (
    <div>
      {/* KPI tiles row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" dir="rtl">
        {tiles.map(tile => {
          const isActive = activeStatFilter === tile.key;
          return (
            <button
              key={tile.key}
              onClick={() => onStatCardFilter(isActive ? null : tile.key)}
              className={[
                'text-right p-4 rounded-xl border transition-all',
                isActive
                  ? tile.bgActive
                  : 'bg-gray-50 border-gray-100 hover:bg-gray-100 hover:border-gray-200',
              ].join(' ')}
            >
              <p className="text-xs text-gray-500 mb-1.5">{tile.label}</p>
              <p className={`text-2xl font-medium ${isActive ? tile.accent : 'text-gray-900'}`}>
                {tile.value}
              </p>
            </button>
          );
        })}
      </div>

      {/* Expand toggle */}
      <div className="mt-2 flex justify-end" dir="rtl">
        <button
          onClick={onToggleFull}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded transition-colors"
        >
          {showFull ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {showFull ? 'הסתר מדדים' : 'כל המדדים ▼'}
        </button>
      </div>

      {/* Full dashboard (collapsible) */}
      {showFull && (
        <div className="mt-3">
          {renderFullDashboard()}
        </div>
      )}
    </div>
  );
}
