'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useOrgSelector } from '@/features/admin/context/OrgSelectorContext';
import { authorityTypeToTenantType } from '@/features/admin/config/tenantLabels';
import type { TenantType } from '@/types/admin-types';
import { Search, Building2, ShieldCheck, GraduationCap, X, ChevronDown } from 'lucide-react';

const TYPE_META: Record<TenantType, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  municipal:   { icon: Building2,     label: 'עירוני',  color: 'text-blue-400',   bg: 'bg-blue-900/30' },
  military:    { icon: ShieldCheck,   label: 'צבאי',    color: 'text-emerald-400', bg: 'bg-emerald-900/30' },
  educational: { icon: GraduationCap, label: 'חינוכי',  color: 'text-orange-400',  bg: 'bg-orange-900/30' },
};

export default function OrgCommandPalette() {
  const { rootOrgs, selectedOrgId, selectedOrg, setSelectedOrgId, searchQuery, setSearchQuery, isOpen, setIsOpen } = useOrgSelector();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [setIsOpen]);

  const grouped = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const map: Record<TenantType, typeof rootOrgs> = { municipal: [], military: [], educational: [] };
    for (const org of rootOrgs) {
      const name = typeof org.name === 'string' ? org.name : (org.name as any)?.he || org.id;
      if (q && !name.toLowerCase().includes(q) && !org.id.toLowerCase().includes(q)) continue;
      map[authorityTypeToTenantType(org.type)].push(org);
    }
    return map;
  }, [rootOrgs, searchQuery]);

  const currentLabel = selectedOrg
    ? (typeof selectedOrg.name === 'string' ? selectedOrg.name : (selectedOrg.name as any)?.he || selectedOrg.id)
    : 'כל הארגונים';

  if (rootOrgs.length === 0) return null;

  return (
    <div ref={containerRef} className="px-3 pt-3 pb-1 flex-shrink-0 relative">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1 mb-1 block">ארגון פעיל</label>

      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 text-white text-sm font-bold rounded-xl px-3 py-2 hover:bg-slate-750 transition-colors"
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-[360px] overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-slate-700">
            <div className="relative">
              <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="חפש ארגון..."
                className="w-full bg-slate-900 border border-slate-600 text-white text-xs rounded-lg pr-8 pl-7 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder:text-slate-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1 p-1.5 space-y-1">
            {/* "All" option */}
            <button
              onClick={() => { setSelectedOrgId('all'); setIsOpen(false); setSearchQuery(''); }}
              className={`w-full text-right flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                selectedOrgId === 'all' ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Building2 size={14} />
              כל הארגונים
            </button>

            {/* Grouped by type */}
            {(['municipal', 'military', 'educational'] as TenantType[]).map(type => {
              const orgs = grouped[type];
              if (orgs.length === 0) return null;
              const meta = TYPE_META[type];
              const Icon = meta.icon;
              return (
                <div key={type}>
                  <p className={`text-[9px] font-black uppercase tracking-widest px-3 pt-2 pb-1 ${meta.color}`}>
                    {meta.label} ({orgs.length})
                  </p>
                  {orgs.map(org => {
                    const name = typeof org.name === 'string' ? org.name : (org.name as any)?.he || org.id;
                    const isActive = selectedOrgId === org.id;
                    return (
                      <button
                        key={org.id}
                        onClick={() => { setSelectedOrgId(org.id); setIsOpen(false); setSearchQuery(''); }}
                        className={`w-full text-right flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                          isActive ? `${meta.bg} ${meta.color}` : 'text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        <Icon size={13} className={isActive ? meta.color : 'text-slate-500'} />
                        <span className="truncate">{name}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {rootOrgs.length > 0 && Object.values(grouped).every(g => g.length === 0) && (
              <p className="text-center text-xs text-slate-500 py-4">לא נמצאו ארגונים</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
