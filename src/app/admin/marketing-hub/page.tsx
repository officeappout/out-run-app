'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS: { id: ContentStatus; label: string; color: string; bg: string; border: string }[] = [
  { id: 'idea',      label: 'רעיון',    color: 'text-sky-700',    bg: 'bg-sky-50',    border: 'border-sky-200' },
  { id: 'raw',       label: 'גלם',     color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  { id: 'scripted',  label: 'תסריט',   color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  { id: 'scheduled', label: 'מתוזמן',  color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  { id: 'published', label: 'פורסם',   color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200' },
];

const PILLAR_META: Record<ContentPillar, { label: string; cls: string }> = {
  strength:  { label: 'כוח',       cls: 'bg-rose-100 text-rose-700' },
  mobility:  { label: 'מוביליטי',  cls: 'bg-sky-100 text-sky-700' },
  mindset:   { label: 'מנטליטי',   cls: 'bg-violet-100 text-violet-700' },
  nutrition: { label: 'תזונה',     cls: 'bg-lime-100 text-lime-700' },
  community: { label: 'קהילה',     cls: 'bg-orange-100 text-orange-700' },
};

const PLATFORM_META: Record<ContentPlatform, { label: string }> = {
  instagram: { label: 'Instagram' },
  tiktok:    { label: 'TikTok' },
  linkedin:  { label: 'LinkedIn' },
};

const ACCOUNT_META: Record<ContentAccount, { label: string; cls: string }> = {
  personal: { label: 'אישי',   cls: 'bg-indigo-100 text-indigo-700' },
  brand:    { label: 'מותג',   cls: 'bg-emerald-100 text-emerald-700' },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketingHubPage() {
  const [items, setItems]           = useState<ContentItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<ContentItem | null>(null);
  const [drawerStatus, setDrawerStatus] = useState<ContentStatus>('idea');
  const [activeItem, setActiveItem] = useState<ContentItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getContentItems());
    } catch {
      setError('שגיאה בטעינת התוכן');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const item = items.find((i) => i.id === event.active.id);
    setActiveItem(item ?? null);
  }, [items]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;
    const itemId = active.id as string;
    const newStatus = over.id as ContentStatus;
    if (!COLUMNS.find((c) => c.id === newStatus)) return;

    const item = items.find((i) => i.id === itemId);
    if (!item || item.status === newStatus) return;

    // Optimistic update
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
  }, [items]);

  const handleMarkPublished = useCallback((item: ContentItem) => {
    if (item.status === 'published') return;
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, status: 'published' as ContentStatus, publishedDate: new Date() }
          : i,
      ),
    );
    updateContentItem(item.id, {
      status: 'published',
      publishedDate: new Date(),
    }).catch(() => {
      setError('סימון כפורסם נכשל');
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)),
      );
    });
  }, []);

  const handleDelete = useCallback(async (item: ContentItem) => {
    if (!confirm(`למחוק את "${item.title}"?`)) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await deleteContentItem(item.id);
    } catch {
      setError('מחיקה נכשלה');
      void load();
    }
  }, [load]);

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

  const byStatus = useCallback(
    (status: ContentStatus) => items.filter((i) => i.status === status),
    [items],
  );

  return (
    <div dir="rtl" className="flex h-screen flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100">
            <Megaphone className="h-5 w-5 text-violet-600" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">מרכז שיווק — תור תוכן</h1>
            <p className="text-xs text-slate-500">{items.length} פריטים · גרור בין עמודות לשינוי סטטוס</p>
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
            onClick={() => openCreate('idea')}
            className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            תוכן חדש
          </button>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 flex shrink-0 items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="rounded p-1 hover:bg-rose-100">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Board */}
      {loading && items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
          <span className="mr-2 text-sm text-slate-500">טוען תוכן…</span>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 gap-4 overflow-x-auto px-6 py-4">
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
            {activeItem ? (
              <CardView item={activeItem} isDragging />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Drawer */}
      <ContentDrawer
        open={drawerOpen}
        item={editing}
        initialStatus={drawerStatus}
        onClose={() => { setDrawerOpen(false); setEditing(null); }}
        onSaved={handleSaved}
      />
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
      {/* Column header */}
      <div className={`flex items-center justify-between rounded-t-2xl ${col.bg} px-4 py-3`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${col.color}`}>{col.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${col.bg} ${col.color} border ${col.border}`}>
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

      {/* Cards */}
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

// ─── DraggableCard ────────────────────────────────────────────────────────────

interface CardProps {
  item: ContentItem;
  onEdit: (item: ContentItem) => void;
  onDelete: (item: ContentItem) => void;
  onMarkPublished: (item: ContentItem) => void;
  isDragging?: boolean;
}

function DraggableCard({ item, onEdit, onDelete, onMarkPublished }: Omit<CardProps, 'isDragging'>) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });

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
  const pillar = PILLAR_META[item.pillar];
  const account = ACCOUNT_META[item.account];
  const platform = item.platform ? PLATFORM_META[item.platform] : null;

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition ${
        isDragging ? 'shadow-xl rotate-1' : 'hover:border-violet-300 hover:shadow-md'
      }`}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">
          {item.title}
        </p>
        {item.agentGenerated && (
          <Bot className="h-3.5 w-3.5 shrink-0 text-violet-400" title="נוצר ע״י סוכן" aria-hidden />
        )}
      </div>

      {/* Badges */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pillar.cls}`}>
          {pillar.label}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${account.cls}`}>
          {account.label}
        </span>
        {platform && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {platform.label}
          </span>
        )}
      </div>

      {/* Caption preview */}
      {item.caption && (
        <p className="mt-2 line-clamp-2 text-xs text-slate-500">{item.caption}</p>
      )}

      {/* Scheduled date */}
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

      {/* Actions — prevent drag propagation */}
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
          {item.status !== 'published' && (
            <button
              type="button"
              onClick={() => onMarkPublished?.(item)}
              className="mr-auto rounded-md px-2 py-0.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
              title="סמן כפורסם"
            >
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                פורסם
              </span>
            </button>
          )}
          {item.status === 'published' && (
            <CheckCircle2 className="mr-auto h-4 w-4 text-emerald-500" aria-hidden />
          )}
        </div>
      )}
    </div>
  );
}

// ─── ContentDrawer ─────────────────────────────────────────────────────────────

interface DrawerProps {
  open: boolean;
  item: ContentItem | null;
  initialStatus: ContentStatus;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function ContentDrawer({ open, item, initialStatus, onClose, onSaved }: DrawerProps) {
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

  // Reset on open
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
      setAccount('personal');
      setStatus(initialStatus);
      setPlatform('');
      setSourceUrl('');
      setCaption('');
    }
    setDrawerError(null);
    setSaving(false);
  }, [open, item, initialStatus]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) { setDrawerError('נדרש כותרת'); return; }
    setSaving(true);
    setDrawerError(null);
    try {
      if (isEdit && item) {
        await updateContentItem(item.id, {
          title,
          pillar,
          account,
          status,
          platform: platform || undefined,
          sourceUrl: sourceUrl || undefined,
          caption: caption || undefined,
        });
      } else {
        await createContentItem({
          title,
          pillar,
          account,
          status,
          platform: platform as ContentPlatform || undefined,
          sourceUrl: sourceUrl || undefined,
          caption: caption || undefined,
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
          {/* Title */}
          <DrawerField label="כותרת" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="למשל: 3 טעויות בדיפ שמשפיעות על הכתף"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </DrawerField>

          {/* Pillar */}
          <DrawerField label="עמוד תוכן" required>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(PILLAR_META) as [ContentPillar, (typeof PILLAR_META)[ContentPillar]][]).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPillar(key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    pillar === key ? meta.cls + ' ring-2 ring-offset-1 ring-violet-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          </DrawerField>

          {/* Account */}
          <DrawerField label="חשבון" required>
            <div className="flex gap-2">
              {(Object.entries(ACCOUNT_META) as [ContentAccount, (typeof ACCOUNT_META)[ContentAccount]][]).map(([key, meta]) => (
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
                  {meta.label}
                </button>
              ))}
            </div>
          </DrawerField>

          {/* Status */}
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

          {/* Platform */}
          <DrawerField label="פלטפורמה (אופציונלי)">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as ContentPlatform | '')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="">— לא צוין —</option>
              {(Object.entries(PLATFORM_META) as [ContentPlatform, { label: string }][]).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          </DrawerField>

          {/* Source URL */}
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

          {/* Caption */}
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
