'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  Calendar,
  User,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
} from 'lucide-react';
import { getUnifiedRoadmap, updateRoadmapItemStatus } from '@/features/admin/services/unified-roadmap.service';
import { getAllSuperAdmins, AdminUser } from '@/features/admin/services/admin-management.service';
import type { RoadmapItem, RoadmapDomain, CommonStatus, RoadmapFilters } from '@/types/roadmap-unified.types';
import {
  COMMON_STATUS_LABELS,
  COMMON_STATUS_COLORS,
  DOMAIN_LABELS,
  DOMAIN_COLORS,
} from '@/types/roadmap-unified.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_DOMAINS: RoadmapDomain[] = ['sales', 'dev', 'marketing'];

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'קריטי',
  high: 'גבוה',
  medium: 'בינוני',
  low: 'נמוך',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-300',
  high:     'bg-orange-100 text-orange-700 border-orange-300',
  medium:   'bg-yellow-100 text-yellow-700 border-yellow-300',
  low:      'bg-gray-100 text-gray-600 border-gray-300',
};

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  onDone,
  markingDone,
}: {
  item: RoadmapItem;
  onDone: (item: RoadmapItem) => void;
  markingDone: boolean;
}) {
  const statusColor = COMMON_STATUS_COLORS[item.status];
  const isDone = item.status === 'done' || item.status === 'cancelled';

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const label = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
    if (diffDays < 0) return { label, overdue: true };
    if (diffDays <= 3) return { label, urgent: true };
    return { label };
  };

  const dateInfo = formatDate(item.dueDate);

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <div
      className={`bg-white border rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all group ${
        isDone ? 'opacity-60' : ''
      }`}
    >
      {/* Title */}
      <p className="text-sm font-semibold text-slate-800 leading-tight mb-2 line-clamp-2">
        {item.title}
      </p>

      {/* Status + Priority row */}
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor.bg} ${statusColor.text} ${statusColor.border}`}
        >
          {COMMON_STATUS_LABELS[item.status]}
        </span>
        {item.priority && (
          <span
            className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[item.priority]}`}
          >
            {PRIORITY_LABELS[item.priority]}
          </span>
        )}
        {item.nativeStatus && item.nativeStatus !== item.status && (
          <span className="inline-flex items-center text-[10px] text-slate-400 px-1.5">
            ({item.nativeStatus})
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        {/* Assignee */}
        {item.assigneeName && (
          <div className="flex items-center gap-1.5 min-w-0">
            {item.assigneePhotoURL ? (
              <img
                src={item.assigneePhotoURL}
                alt={item.assigneeName}
                className="w-5 h-5 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                <span className="text-[9px] font-bold text-slate-600">
                  {getInitials(item.assigneeName)}
                </span>
              </div>
            )}
            <span className="truncate text-[11px]">{item.assigneeName}</span>
          </div>
        )}

        {/* Due date */}
        {dateInfo && (
          <div
            className={`flex items-center gap-1 flex-shrink-0 text-[11px] ${
              dateInfo.overdue
                ? 'text-red-600 font-semibold'
                : dateInfo.urgent
                ? 'text-amber-600 font-semibold'
                : 'text-slate-400'
            }`}
          >
            {dateInfo.overdue && <AlertTriangle size={11} />}
            <Calendar size={11} />
            <span>{dateInfo.label}</span>
          </div>
        )}
      </div>

      {/* Mark done button — visible on hover, hidden when already done */}
      {!isDone && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onDone(item)}
            disabled={markingDone}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 transition-colors"
          >
            {markingDone ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CheckCircle2 size={12} />
            )}
            סמן כ"הושלם"
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Domain Column ────────────────────────────────────────────────────────────

function DomainColumn({
  domain,
  items,
  onDone,
  doneItemId,
}: {
  domain: RoadmapDomain;
  items: RoadmapItem[];
  onDone: (item: RoadmapItem) => void;
  doneItemId: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const colors = DOMAIN_COLORS[domain];
  const label = DOMAIN_LABELS[domain];

  const activeItems = items.filter(i => i.status !== 'done' && i.status !== 'cancelled');
  const doneItems = items.filter(i => i.status === 'done' || i.status === 'cancelled');

  return (
    <div className={`flex flex-col rounded-2xl border ${colors.border} ${colors.bg} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-current/10">
        <div className="flex items-center gap-2">
          <span className={`font-black text-sm ${colors.accent}`}>{label}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/60 ${colors.accent}`}>
            {activeItems.length}
          </span>
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          className={`${colors.accent} opacity-60 hover:opacity-100 transition-opacity`}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {/* Items */}
      {!collapsed && (
        <div className="p-3 space-y-2 flex-1 overflow-y-auto max-h-[70vh]">
          {items.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">
              {domain === 'marketing' ? 'טרם נוספו פריטים' : 'אין פריטים תואמים'}
            </div>
          )}

          {/* Active items */}
          {activeItems.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              onDone={onDone}
              markingDone={doneItemId === item.id}
            />
          ))}

          {/* Done items — collapsed by default */}
          {doneItems.length > 0 && (
            <details className="group">
              <summary className="text-[11px] text-slate-400 font-semibold cursor-pointer py-1 select-none list-none flex items-center gap-1">
                <span className="group-open:hidden">▸</span>
                <span className="hidden group-open:inline">▾</span>
                הושלמו / בוטלו ({doneItems.length})
              </summary>
              <div className="mt-2 space-y-2">
                {doneItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onDone={onDone}
                    markingDone={doneItemId === item.id}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
        active
          ? 'bg-slate-800 text-white border-slate-800'
          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MasterRoadmapPage() {
  const router = useRouter();
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [doneItemId, setDoneItemId] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  // Filter state
  const [selectedDomains, setSelectedDomains] = useState<RoadmapDomain[]>([]);
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [thisWeek, setThisWeek] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<CommonStatus | null>(null);

  // Auth + section guard (strategy)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { router.replace('/admin/login'); return; }
      setCurrentUid(user.uid);
      try {
        const role = await checkUserRole(user.uid, user.email);
        // super/system admins always pass; allowedSections empty = no restriction (back-compat)
        const allowed =
          role.isSuperAdmin ||
          role.isSystemAdmin ||
          role.allowedSections.length === 0 ||
          role.allowedSections.includes('strategy');
        if (!allowed) { setAccessDenied(true); router.replace('/admin'); }
      } catch { /* let the layout handle it */ }
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (adminList: AdminUser[] = admins) => {
    setLoading(true);
    setError(null);
    try {
      const filters: RoadmapFilters = {};
      if (selectedDomains.length > 0) filters.domains = selectedDomains;
      if (myTasksOnly && currentUid) filters.assigneeId = currentUid;
      if (thisWeek) filters.thisWeek = true;
      if (selectedStatus) filters.status = selectedStatus;

      const data = await getUnifiedRoadmap(filters, adminList);
      setItems(data);
    } catch (e) {
      setError('שגיאה בטעינת מפת הדרכים');
      console.error(e);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomains, myTasksOnly, thisWeek, selectedStatus, currentUid]);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const adminList = await getAllSuperAdmins();
        setAdmins(adminList);
        await load(adminList);
      } catch {
        await load();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload on filter change (not on initial mount — handled above)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!mounted) { setMounted(true); return; }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomains, myTasksOnly, thisWeek, selectedStatus]);

  const handleDone = async (item: RoadmapItem) => {
    setDoneItemId(item.id);
    try {
      await updateRoadmapItemStatus(item, 'done');
      // Optimistic update
      setItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, status: 'done' as CommonStatus } : i)
      );
    } catch (e) {
      console.error('Failed to mark done:', e);
      setError('שגיאה בעדכון הפריט');
    } finally {
      setDoneItemId(null);
    }
  };

  const toggleDomain = (domain: RoadmapDomain) => {
    setSelectedDomains(prev =>
      prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]
    );
  };

  const toggleStatus = (status: CommonStatus) => {
    setSelectedStatus(prev => (prev === status ? null : status));
  };

  // Group items by domain for swimlanes
  const byDomain = (domain: RoadmapDomain) =>
    items.filter(i => i.domain === domain);

  // Counts
  const totalActive = items.filter(i => i.status !== 'done' && i.status !== 'cancelled').length;

  if (accessDenied) return null;

  return (
    <div className="max-w-none">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <LayoutGrid size={22} className="text-slate-600" />
            <h1 className="text-2xl font-black text-slate-900">מפת דרכים מאוחדת</h1>
          </div>
          <p className="text-sm text-slate-500">
            מכירות · פיתוח · שיווק — תצוגה אסטרטגית על כל הדומיינים
          </p>
        </div>

        <div className="flex items-center gap-2">
          {totalActive > 0 && (
            <span className="text-sm text-slate-500 font-medium">
              {totalActive} פריטים פעילים
            </span>
          )}
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            רענן
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6 p-3 bg-slate-50 rounded-2xl border border-slate-100">
        {/* Domain filters */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">דומיין</span>
          {ALL_DOMAINS.map(domain => (
            <FilterChip
              key={domain}
              active={selectedDomains.includes(domain)}
              onClick={() => toggleDomain(domain)}
            >
              <span className={DOMAIN_COLORS[domain].accent}>{DOMAIN_LABELS[domain]}</span>
            </FilterChip>
          ))}
        </div>

        <div className="w-px bg-slate-200 self-stretch" />

        {/* Quick filters */}
        <FilterChip active={myTasksOnly} onClick={() => setMyTasksOnly(v => !v)}>
          <span className="flex items-center gap-1">
            <User size={11} />
            המשימות שלי
          </span>
        </FilterChip>
        <FilterChip active={thisWeek} onClick={() => setThisWeek(v => !v)}>
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            השבוע
          </span>
        </FilterChip>

        <div className="w-px bg-slate-200 self-stretch" />

        {/* Status filters */}
        {(['todo', 'in_progress', 'blocked', 'done'] as CommonStatus[]).map(status => (
          <FilterChip
            key={status}
            active={selectedStatus === status}
            onClick={() => toggleStatus(status)}
          >
            <span className={`${COMMON_STATUS_COLORS[status].text}`}>
              {COMMON_STATUS_LABELS[status]}
            </span>
          </FilterChip>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Swimlanes grid */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={32} className="animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ALL_DOMAINS.map(domain => (
            <DomainColumn
              key={domain}
              domain={domain}
              items={byDomain(domain)}
              onDone={handleDone}
              doneItemId={doneItemId}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <LayoutGrid size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-base font-semibold">אין פריטים תואמים לפילטרים שנבחרו</p>
          <button
            onClick={() => {
              setSelectedDomains([]);
              setMyTasksOnly(false);
              setThisWeek(false);
              setSelectedStatus(null);
            }}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            נקה פילטרים
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="mt-8 pt-4 border-t border-slate-100 flex flex-wrap gap-4 text-[11px] text-slate-400">
        <span className="font-bold">מקרא:</span>
        {Object.entries(COMMON_STATUS_LABELS).map(([key, label]) => {
          const c = COMMON_STATUS_COLORS[key as CommonStatus];
          return (
            <span key={key} className={`px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
