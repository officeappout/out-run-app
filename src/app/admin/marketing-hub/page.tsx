'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  X,
  Loader2,
  Pencil,
  CheckCircle2,
  Megaphone,
  RefreshCw,
  Trash2,
  Bot,
  TrendingUp,
  Users,
  Heart,
  Target,
} from 'lucide-react';
import {
  type ContentItem,
  type ContentPillar,
  type ContentStatus,
  type ContentAccount,
  type ContentPlatform,
  createContentItem,
  getContentItems,
  updateContentItem,
  deleteContentItem,
} from '@/features/admin/services/content-items.service';
import {
  type AccountMetric,
  type AccountMetricPlatform,
  type AccountMetricAccount,
  addAccountMetric,
  getAccountMetrics,
  getMarketingAttributedCount,
} from '@/features/admin/services/account-metrics.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS: {
  id: ContentStatus;
  label: string;
  color: string;
  bg: string;
  border: string;
}[] = [
  { id: 'idea',      label: 'רעיון',   color: 'text-sky-700',    bg: 'bg-sky-50',    border: 'border-sky-200' },
  { id: 'raw',       label: 'גלם',     color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  { id: 'scripted',  label: 'תסריט',   color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  { id: 'scheduled', label: 'מתוזמן',  color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  { id: 'published', label: 'פורסם',   color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200' },
];

const PILLAR_META: Record<ContentPillar, { label: string; cls: string }> = {
  strength:  { label: 'כוח',      cls: 'bg-rose-100 text-rose-700' },
  mobility:  { label: 'מוביליטי', cls: 'bg-sky-100 text-sky-700' },
  mindset:   { label: 'מנטליטי',  cls: 'bg-violet-100 text-violet-700' },
  nutrition: { label: 'תזונה',    cls: 'bg-lime-100 text-lime-700' },
  community: { label: 'קהילה',    cls: 'bg-orange-100 text-orange-700' },
};

const CONTENT_PLATFORM_META: Record<ContentPlatform, { label: string }> = {
  instagram: { label: 'Instagram' },
  tiktok:    { label: 'TikTok' },
  linkedin:  { label: 'LinkedIn' },
  youtube:   { label: 'YouTube' },
  facebook:  { label: 'Facebook' },
};

const ACCOUNT_META: Record<ContentAccount, { label: string; sublabel: string; cls: string; activeCls: string }> = {
  personal: { label: 'אישי',  sublabel: 'david.move26', cls: 'text-indigo-700',  activeCls: 'bg-indigo-600 text-white' },
  brand:    { label: 'מותג',  sublabel: 'outapp.il',    cls: 'text-emerald-700', activeCls: 'bg-emerald-600 text-white' },
};

const METRIC_PLATFORMS: { id: AccountMetricPlatform; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok',   label: 'TikTok' },
  { id: 'youtube',  label: 'YouTube' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'facebook', label: 'Facebook' },
];

const FOLLOWERS_TARGET = 4000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function latestMetric(
  metrics: AccountMetric[],
  account: AccountMetricAccount,
  platform: AccountMetricPlatform,
): AccountMetric | null {
  return (
    metrics
      .filter((m) => m.account === account && m.platform === platform)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null
  );
}

function fmtNum(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('he-IL');
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketingHubPage() {
  const [items, setItems]                 = useState<ContentItem[]>([]);
  const [metrics, setMetrics]             = useState<AccountMetric[]>([]);
  const [utmCount, setUtmCount]           = useState<number | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);

  // Account toggle — filters board + KPI cards 1‑3
  const [selectedAccount, setSelectedAccount] = useState<ContentAccount>('personal');

  // Drawers / modals
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [editing, setEditing]             = useState<ContentItem | null>(null);
  const [drawerStatus, setDrawerStatus]   = useState<ContentStatus>('idea');
  const [metricsOpen, setMetricsOpen]     = useState(false);

  // DnD overlay
  const [activeItem, setActiveItem]       = useState<ContentItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedItems, fetchedMetrics, fetchedUtm] = await Promise.all([
        getContentItems(),
        getAccountMetrics(),
        getMarketingAttributedCount(),
      ]);
      setItems(fetchedItems);
      setMetrics(fetchedMetrics);
      setUtmCount(fetchedUtm);
    } catch {
      setError('שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── DnD ───────────────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveItem(items.find((i) => i.id === event.active.id) ?? null);
    },
    [items],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveItem(null);
      const { active, over } = event;
      if (!over) return;
      const itemId   = active.id as string;
      const newStatus = over.id as ContentStatus;
      if (!COLUMNS.find((c) => c.id === newStatus)) return;
      const item = items.find((i) => i.id === itemId);
      if (!item || item.status === newStatus) return;
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, status: newStatus } : i)),
      );
      const patch: Parameters<typeof updateContentItem>[1] = { status: newStatus };
      if (newStatus === 'published') patch.publishedDate = new Date();
      updateContentItem(itemId, patch).catch(() => {
        setError('עדכון סטטוס נכשל');
        setItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, status: item.status } : i)),
        );
      });
    },
    [items],
  );

  // ── Content item actions ───────────────────────────────────────────────────

  const handleMarkPublished = useCallback((item: ContentItem) => {
    if (item.status === 'published') return;
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, status: 'published' as ContentStatus, publishedDate: new Date() }
          : i,
      ),
    );
    updateContentItem(item.id, { status: 'published', publishedDate: new Date() }).catch(
      () => {
        setError('סימון כפורסם נכשל');
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)),
        );
      },
    );
  }, []);

  const handleDelete = useCallback(
    async (item: ContentItem) => {
      if (!confirm(`למחוק את "${item.title}"?`)) return;
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      try {
        await deleteContentItem(item.id);
      } catch {
        setError('מחיקה נכשלה');
        void load();
      }
    },
    [load],
  );

  const openCreate = useCallback((status: ContentStatus) => {
    setEditing(null);
    setDrawerStatus(status);
    setDrawerOpen(true);
  }, []);

  const openEdit = useCallback((item: ContentItem) => {
    setEditing(item);
    setDrawerStatus(item.status);
    setDrawerOpen(true);
  }, []);

  const handleSaved = useCallback(async () => {
    setDrawerOpen(false);
    setEditing(null);
    await load();
  }, [load]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const filteredItems = items.filter((i) => i.account === selectedAccount);
  const byStatus = (status: ContentStatus) =>
    filteredItems.filter((i) => i.status === status);

  // KPI values
  const igFollowers  = latestMetric(metrics, selectedAccount, 'instagram')?.followers;
  const igSaves      = latestMetric(metrics, selectedAccount, 'instagram')?.saves;
  const progress4k   = latestMetric(metrics, 'personal', 'instagram')?.followers ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="flex h-screen flex-col overflow-hidden bg-slate-50">

      {/* ── Header ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100">
            <Megaphone className="h-5 w-5 text-violet-600" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">מרכז שיווק</h1>
            <p className="text-xs text-slate-500">{items.length} פריטים</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setMetricsOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100"
          >
            <TrendingUp className="h-4 w-4" aria-hidden />
            עדכן מדדים
          </button>
          <button
            type="button"
            onClick={() => openCreate('idea')}
            className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            תוכן חדש
          </button>
        </div>
      </header>

      {/* ── Account toggle ── */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="ml-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">חשבון</span>
          {(Object.keys(ACCOUNT_META) as ContentAccount[]).map((acc) => {
            const meta = ACCOUNT_META[acc];
            const active = selectedAccount === acc;
            return (
              <button
                key={acc}
                type="button"
                onClick={() => setSelectedAccount(acc)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  active
                    ? meta.activeCls + ' shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {meta.label}
                <span className={`text-xs ${active ? 'opacity-80' : 'text-slate-400'}`}>
                  @{meta.sublabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mx-6 mt-3 flex shrink-0 items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="rounded p-1 hover:bg-rose-100">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* ── KPI strip ── */}
      <div className="shrink-0 grid grid-cols-4 gap-3 px-6 py-3">
        {/* 1 — Followers */}
        <KpiCard
          icon={<Users className="h-4 w-4 text-indigo-500" aria-hidden />}
          label={`עוקבים · ${ACCOUNT_META[selectedAccount].label}`}
          value={fmtNum(igFollowers)}
          sublabel="Instagram · ידני"
          tone="indigo"
          empty={igFollowers === undefined}
        />

        {/* 2 — Saves */}
        <KpiCard
          icon={<Heart className="h-4 w-4 text-rose-500" aria-hidden />}
          label={`Saves · ${ACCOUNT_META[selectedAccount].label}`}
          value={fmtNum(igSaves)}
          sublabel="Instagram · ידני"
          tone="rose"
          empty={igSaves === undefined}
        />

        {/* 3 — Progress to 4,000 (always personal·instagram) */}
        <KpiCard
          icon={<Target className="h-4 w-4 text-violet-500" aria-hidden />}
          label="יעד 4,000 עוקבים"
          value={`${fmtNum(progress4k)} / ${fmtNum(FOLLOWERS_TARGET)}`}
          sublabel="@david.move26 · Instagram"
          tone="violet"
          progress={Math.min(progress4k / FOLLOWERS_TARGET, 1)}
          empty={progress4k === 0}
        />

        {/* 4 — UTM registrations (always global, not account-filtered) */}
        <KpiCard
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden />}
          label="רשומים דרך שיווק"
          value={utmCount !== null ? fmtNum(utmCount) : '…'}
          sublabel="UTM attribution · אמיתי"
          tone="emerald"
        />
      </div>

      {/* ── Board ── */}
      {loading && items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
          <span className="mr-2 text-sm text-slate-500">טוען…</span>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 gap-4 overflow-x-auto px-6 py-3">
            {COLUMNS.map((col) => (
              <BoardColumn
                key={col.id}
                col={col}
                items={byStatus(col.id)}
                onAdd={() => openCreate(col.id)}
                onEdit={openEdit}
                onDelete={handleDelete}
                onMarkPublished={handleMarkPublished}
              />
            ))}
          </div>

          <DragOverlay>
            {activeItem ? <CardView item={activeItem} isDragging /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Drawers / Modals ── */}
      <ContentDrawer
        open={drawerOpen}
        item={editing}
        initialStatus={drawerStatus}
        initialAccount={selectedAccount}
        onClose={() => { setDrawerOpen(false); setEditing(null); }}
        onSaved={handleSaved}
      />

      <MetricsModal
        open={metricsOpen}
        initialAccount={selectedAccount}
        onClose={() => setMetricsOpen(false)}
        onSaved={async () => {
          setMetricsOpen(false);
          const fresh = await getAccountMetrics();
          setMetrics(fresh);
        }}
      />
    </div>
  );
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  sublabel,
  tone = 'slate',
  progress,
  empty,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  tone?: 'slate' | 'indigo' | 'rose' | 'violet' | 'emerald';
  progress?: number; // 0–1
  empty?: boolean;
}) {
  const borders: Record<string, string> = {
    slate:   'border-slate-200',
    indigo:  'border-indigo-100',
    rose:    'border-rose-100',
    violet:  'border-violet-100',
    emerald: 'border-emerald-100',
  };
  const bgs: Record<string, string> = {
    slate:   'bg-white',
    indigo:  'bg-indigo-50/60',
    rose:    'bg-rose-50/60',
    violet:  'bg-violet-50/60',
    emerald: 'bg-emerald-50/60',
  };
  const bars: Record<string, string> = {
    indigo:  'bg-indigo-500',
    violet:  'bg-violet-500',
    emerald: 'bg-emerald-500',
    rose:    'bg-rose-500',
    slate:   'bg-slate-400',
  };

  return (
    <div className={`rounded-2xl border ${borders[tone]} ${bgs[tone]} p-4 shadow-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon}
      </div>
      <div className={`mt-1.5 text-2xl font-bold ${empty ? 'text-slate-400' : 'text-slate-900'}`}>
        {value}
      </div>
      {sublabel && (
        <p className="mt-0.5 text-xs text-slate-400">{sublabel}</p>
      )}
      {progress !== undefined && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all ${bars[tone]}`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── BoardColumn ──────────────────────────────────────────────────────────────

interface BoardColumnProps {
  col: (typeof COLUMNS)[number];
  items: ContentItem[];
  onAdd: () => void;
  onEdit: (item: ContentItem) => void;
  onDelete: (item: ContentItem) => void;
  onMarkPublished: (item: ContentItem) => void;
}

function BoardColumn({ col, items, onAdd, onEdit, onDelete, onMarkPublished }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  return (
    <div
      className={`flex w-72 shrink-0 flex-col rounded-2xl border ${col.border} transition-shadow ${
        isOver ? 'shadow-lg ring-2 ring-violet-300' : ''
      }`}
    >
      <div className={`flex items-center justify-between rounded-t-2xl ${col.bg} px-4 py-3`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${col.color}`}>{col.label}</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${col.bg} ${col.color} ${col.border}`}>
            {items.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className={`rounded-full p-1 ${col.color} hover:bg-white/70 transition`}
          title={`הוסף לעמודת "${col.label}"`}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div
        ref={setNodeRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto p-3"
        style={{ minHeight: 120 }}
      >
        {items.map((item) => (
          <DraggableCard
            key={item.id}
            item={item}
            onEdit={onEdit}
            onDelete={onDelete}
            onMarkPublished={onMarkPublished}
          />
        ))}
        {items.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 py-8 text-xs text-slate-400">
            גרור כרטיס לכאן
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DraggableCard / CardView ─────────────────────────────────────────────────

interface CardProps {
  item: ContentItem;
  onEdit?: (item: ContentItem) => void;
  onDelete?: (item: ContentItem) => void;
  onMarkPublished?: (item: ContentItem) => void;
  isDragging?: boolean;
}

function DraggableCard({
  item,
  onEdit,
  onDelete,
  onMarkPublished,
}: Omit<CardProps, 'isDragging'>) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <CardView
        item={item}
        onEdit={onEdit}
        onDelete={onDelete}
        onMarkPublished={onMarkPublished}
      />
    </div>
  );
}

function CardView({ item, onEdit, onDelete, onMarkPublished, isDragging }: CardProps) {
  const pillar  = PILLAR_META[item.pillar];
  const platform = item.platform
    ? CONTENT_PLATFORM_META[item.platform]
    : null;

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition ${
        isDragging
          ? 'shadow-xl rotate-1'
          : 'hover:border-violet-300 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800">
          {item.title}
        </p>
        {item.agentGenerated && (
          <Bot
            className="h-3.5 w-3.5 shrink-0 text-violet-400"
            title="נוצר ע״י סוכן"
            aria-hidden
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pillar.cls}`}>
          {pillar.label}
        </span>
        {platform && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {platform.label}
          </span>
        )}
      </div>

      {item.caption && (
        <p className="mt-2 line-clamp-2 text-xs text-slate-500">{item.caption}</p>
      )}

      {item.scheduledDate && item.status !== 'published' && (
        <p className="mt-1.5 text-xs text-orange-600">
          {item.scheduledDate.toLocaleDateString('he-IL')}
        </p>
      )}
      {item.publishedDate && item.status === 'published' && (
        <p className="mt-1.5 text-xs text-emerald-600">
          פורסם {item.publishedDate.toLocaleDateString('he-IL')}
        </p>
      )}

      {!isDragging && (
        <div
          className="mt-2.5 flex items-center gap-1 border-t border-slate-100 pt-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onEdit?.(item)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="ערוך"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onDelete?.(item)}
            className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            title="מחק"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
          {item.status !== 'published' ? (
            <button
              type="button"
              onClick={() => onMarkPublished?.(item)}
              className="mr-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              פורסם
            </button>
          ) : (
            <CheckCircle2 className="mr-auto h-4 w-4 text-emerald-500" aria-hidden />
          )}
        </div>
      )}
    </div>
  );
}

// ─── ContentDrawer ────────────────────────────────────────────────────────────

interface ContentDrawerProps {
  open: boolean;
  item: ContentItem | null;
  initialStatus: ContentStatus;
  initialAccount: ContentAccount;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function ContentDrawer({
  open,
  item,
  initialStatus,
  initialAccount,
  onClose,
  onSaved,
}: ContentDrawerProps) {
  const isEdit = !!item;
  const [title, setTitle]         = useState('');
  const [pillar, setPillar]       = useState<ContentPillar>('strength');
  const [account, setAccount]     = useState<ContentAccount>('personal');
  const [status, setStatus]       = useState<ContentStatus>('idea');
  const [platform, setPlatform]   = useState<ContentPlatform | ''>('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [caption, setCaption]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setTitle(item.title);
      setPillar(item.pillar);
      setAccount(item.account);
      setStatus(item.status);
      setPlatform(item.platform ?? '');
      setSourceUrl(item.sourceUrl ?? '');
      setCaption(item.caption ?? '');
    } else {
      setTitle('');
      setPillar('strength');
      setAccount(initialAccount);
      setStatus(initialStatus);
      setPlatform('');
      setSourceUrl('');
      setCaption('');
    }
    setDrawerError(null);
    setSaving(false);
  }, [open, item, initialStatus, initialAccount]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) { setDrawerError('נדרשת כותרת'); return; }
    setSaving(true);
    setDrawerError(null);
    try {
      if (isEdit && item) {
        await updateContentItem(item.id, {
          title, pillar, account, status,
          platform: (platform as ContentPlatform) || undefined,
          sourceUrl: sourceUrl || undefined,
          caption:   caption || undefined,
        });
      } else {
        await createContentItem({
          title, pillar, account, status,
          platform: (platform as ContentPlatform) || undefined,
          sourceUrl: sourceUrl || undefined,
          caption:   caption || undefined,
        });
      }
      await onSaved();
    } catch {
      setDrawerError('שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }, [title, pillar, account, status, platform, sourceUrl, caption, isEdit, item, onSaved]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <button
        type="button"
        aria-label="סגור"
        className="flex-1 bg-slate-900/40"
        onClick={() => { if (!saving) onClose(); }}
      />
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isEdit ? 'עריכת פריט תוכן' : 'פריט תוכן חדש'}
            </h2>
            <p className="text-xs text-slate-500">מנסח בלבד — לא מפרסם</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <DrawerField label="כותרת" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="למשל: 3 טעויות בדיפ שמשפיעות על הכתף"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </DrawerField>

          <DrawerField label="עמוד תוכן" required>
            <div className="flex flex-wrap gap-2">
              {(
                Object.entries(PILLAR_META) as [
                  ContentPillar,
                  (typeof PILLAR_META)[ContentPillar],
                ][]
              ).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPillar(key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    pillar === key
                      ? meta.cls + ' ring-2 ring-offset-1 ring-violet-400'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          </DrawerField>

          <DrawerField label="חשבון" required>
            <div className="flex gap-2">
              {(Object.keys(ACCOUNT_META) as ContentAccount[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAccount(key)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${
                    account === key
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {ACCOUNT_META[key].label}
                </button>
              ))}
            </div>
          </DrawerField>

          <DrawerField label="סטטוס" required>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ContentStatus)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </DrawerField>

          <DrawerField label="פלטפורמה (אופציונלי)">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as ContentPlatform | '')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="">— לא צוין —</option>
              {(
                Object.entries(CONTENT_PLATFORM_META) as [
                  ContentPlatform,
                  { label: string },
                ][]
              ).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          </DrawerField>

          <DrawerField label="קישור מקור (אופציונלי)">
            <input
              type="url"
              dir="ltr"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </DrawerField>

          <DrawerField label="קפשן / תסריט (אופציונלי)">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="טקסט הפוסט, hook, CTA…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </DrawerField>

          {drawerError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {drawerError}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {isEdit ? 'עדכון' : 'יצירה'}
          </button>
        </footer>
      </aside>
    </div>
  );
}

// ─── MetricsModal ─────────────────────────────────────────────────────────────

interface MetricsModalProps {
  open: boolean;
  initialAccount: ContentAccount;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function MetricsModal({ open, initialAccount, onClose, onSaved }: MetricsModalProps) {
  const [account, setAccount]     = useState<AccountMetricAccount>(initialAccount);
  const [platform, setPlatform]   = useState<AccountMetricPlatform>('instagram');
  const [followers, setFollowers] = useState('');
  const [saves, setSaves]         = useState('');
  const [notes, setNotes]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAccount(initialAccount);
    setPlatform('instagram');
    setFollowers('');
    setSaves('');
    setNotes('');
    setModalError(null);
    setSaving(false);
  }, [open, initialAccount]);

  const handleSubmit = useCallback(async () => {
    const followersNum = parseInt(followers, 10);
    if (!followers || isNaN(followersNum) || followersNum < 0) {
      setModalError('מספר עוקבים נדרש');
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      await addAccountMetric({
        account,
        platform,
        followers: followersNum,
        saves:   saves ? parseInt(saves, 10) : undefined,
        notes:   notes || undefined,
      });
      await onSaved();
    } catch {
      setModalError('שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }, [account, platform, followers, saves, notes, onSaved]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <button
        type="button"
        aria-label="סגור"
        className="absolute inset-0 bg-slate-900/40"
        onClick={() => { if (!saving) onClose(); }}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">עדכון מדדים חברתיים</h2>
            <p className="text-xs text-slate-500">הזנה ידנית · נשמר להיסטוריה</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Account */}
          <DrawerField label="חשבון" required>
            <div className="flex gap-2">
              {(Object.keys(ACCOUNT_META) as ContentAccount[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAccount(key as AccountMetricAccount)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${
                    account === key
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {ACCOUNT_META[key].label}
                </button>
              ))}
            </div>
          </DrawerField>

          {/* Platform */}
          <DrawerField label="פלטפורמה" required>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as AccountMetricPlatform)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              {METRIC_PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </DrawerField>

          {/* Followers */}
          <DrawerField label="עוקבים" required>
            <input
              type="number"
              min="0"
              value={followers}
              onChange={(e) => setFollowers(e.target.value)}
              placeholder="למשל: 3840"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </DrawerField>

          {/* Saves */}
          <DrawerField label="Saves (אופציונלי)">
            <input
              type="number"
              min="0"
              value={saves}
              onChange={(e) => setSaves(e.target.value)}
              placeholder="למשל: 18"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </DrawerField>

          {/* Notes */}
          <DrawerField label="הערות (אופציונלי)">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="למשל: לאחר ריל ראשון"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </DrawerField>

          {modalError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {modalError}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            שמור מדדים
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DrawerField ──────────────────────────────────────────────────────────────

function DrawerField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
