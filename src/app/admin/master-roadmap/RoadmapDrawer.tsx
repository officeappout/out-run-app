'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Trash2 } from 'lucide-react';
import type { RoadmapItem, CommonStatus, RoadmapPriority } from '@/types/roadmap-unified.types';
import { COMMON_STATUS_LABELS } from '@/types/roadmap-unified.types';
import { updateGoal, deleteGoal } from '@/features/admin/services/roadmap-goals.service';
import { updateRoadmapItem } from '@/features/admin/services/unified-roadmap.service';
import { ROADMAP_LANES } from '@/config/roadmap-lanes.config';
import type { AdminUser } from '@/features/admin/services/admin-management.service';

// ─── Field components ─────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
      dir="rtl"
    />
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
      dir="rtl"
    >
      {children}
    </select>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  item: RoadmapItem;
  goals: RoadmapItem[]; // all goals — for parent selector + task-to-goal assignment
  admins: AdminUser[];
  onClose: () => void;
  onSaved: () => void; // trigger reload in parent
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

export default function RoadmapDrawer({ item, goals, admins, onClose, onSaved }: Props) {
  // Base fields
  const [title, setTitle]           = useState(item.title);
  const [status, setStatus]         = useState<CommonStatus>(item.status);
  const [priority, setPriority]     = useState<string>(item.priority ?? '');
  const [assigneeId, setAssigneeId] = useState<string>(item.assigneeId ?? '');
  const [startDate, setStartDate]   = useState(item.startDate?.slice(0, 10) ?? '');
  const [dueDate, setDueDate]       = useState(item.dueDate?.slice(0, 10) ?? '');
  const [parentGoalId, setParentGoalId] = useState<string>(item.parentGoalId ?? '');

  // Goal-only fields
  const [goalType, setGoalType]         = useState<'project' | 'metric'>(item.goalType ?? 'project');
  const [theme, setTheme]               = useState(item.theme ?? '');
  const [milestoneDate, setMilestoneDate] = useState(item.milestoneDate?.slice(0, 10) ?? '');
  const [targetValue, setTargetValue]   = useState(item.targetValue?.toString() ?? '');
  const [currentValue, setCurrentValue] = useState(item.currentValue?.toString() ?? '');
  const [unit, setUnit]                 = useState(item.unit ?? '');

  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Reset when item changes
  useEffect(() => {
    setTitle(item.title);
    setStatus(item.status);
    setPriority(item.priority ?? '');
    setAssigneeId(item.assigneeId ?? '');
    setStartDate(item.startDate?.slice(0, 10) ?? '');
    setDueDate(item.dueDate?.slice(0, 10) ?? '');
    setParentGoalId(item.parentGoalId ?? '');
    setGoalType(item.goalType ?? 'project');
    setTheme(item.theme ?? '');
    setMilestoneDate(item.milestoneDate?.slice(0, 10) ?? '');
    setTargetValue(item.targetValue?.toString() ?? '');
    setCurrentValue(item.currentValue?.toString() ?? '');
    setUnit(item.unit ?? '');
  }, [item.id]);

  const selectedAdmin = admins.find(a => a.id === assigneeId) ?? null;

  const handleSave = async () => {
    if (!title.trim()) { setError('כותרת חובה'); return; }
    setSaving(true);
    setError(null);
    try {
      const baseUpdates = {
        title: title.trim(),
        status,
        priority: priority ? (priority as RoadmapPriority) : null,
        assigneeId: assigneeId || null,
        assigneeName: selectedAdmin?.name ?? (assigneeId ? item.assigneeName : null),
        startDate: startDate ? new Date(startDate).toISOString() : null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        parentGoalId: parentGoalId || null,
      };

      if (item.isGoal) {
        await updateGoal(item.sourceRef.docId, {
          ...baseUpdates,
          goalType,
          theme: theme || null,
          milestoneDate: milestoneDate ? new Date(milestoneDate).toISOString() : null,
          targetValue: targetValue ? parseFloat(targetValue) : null,
          currentValue: currentValue ? parseFloat(currentValue) : null,
          unit: unit || null,
        });
      } else {
        await updateRoadmapItem(item, baseUpdates);
      }

      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      setError('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item.isGoal) return; // task deletion not supported from drawer
    if (!confirm(`למחוק את היעד "${item.title}"?`)) return;
    setDeleting(true);
    try {
      await deleteGoal(item.sourceRef.docId);
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      setError('שגיאה במחיקה');
      setDeleting(false);
    }
  };

  // Available parent goals (not self, not children of self)
  const availableParentGoals = goals.filter(
    g => g.id !== item.id && g.parentGoalId !== item.id,
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 bottom-0 w-96 bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
              {item.isGoal ? (item.goalType === 'metric' ? 'יעד מדיד' : 'יעד פרויקט') : 'משימה'}
            </p>
            <h2 className="text-base font-black text-gray-900 leading-tight line-clamp-1">
              {item.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <Label>כותרת</Label>
            <Input value={title} onChange={setTitle} placeholder="כותרת הפריט" />
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>סטטוס</Label>
              <Select value={status} onChange={v => setStatus(v as CommonStatus)}>
                {Object.entries(COMMON_STATUS_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>עדיפות</Label>
              <Select value={priority} onChange={setPriority}>
                <option value="">ללא</option>
                <option value="critical">קריטי</option>
                <option value="high">גבוה</option>
                <option value="medium">בינוני</option>
                <option value="low">נמוך</option>
              </Select>
            </div>
          </div>

          {/* Assignee */}
          <div>
            <Label>אחראי</Label>
            <Select value={assigneeId} onChange={setAssigneeId}>
              <option value="">ללא אחראי</option>
              {admins.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>תחילה</Label>
              <Input type="date" value={startDate} onChange={setStartDate} />
            </div>
            <div>
              <Label>יעד</Label>
              <Input type="date" value={dueDate} onChange={setDueDate} />
            </div>
          </div>

          {/* Goal-specific fields */}
          {item.isGoal && (
            <>
              {/* Milestone date */}
              <div>
                <Label>אבן דרך (◆ מעוין)</Label>
                <Input type="date" value={milestoneDate} onChange={setMilestoneDate} />
              </div>

              {/* Goal type */}
              <div>
                <Label>סוג יעד</Label>
                <div className="flex gap-2">
                  {(['project', 'metric'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setGoalType(t)}
                      className={`flex-1 text-sm font-semibold py-2 rounded-lg border transition-all ${
                        goalType === t
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {t === 'project' ? 'פרויקט (% ביצוע)' : 'מדיד (target)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Metric fields */}
              {goalType === 'metric' && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>יעד</Label>
                    <Input type="number" value={targetValue} onChange={setTargetValue} placeholder="100" />
                  </div>
                  <div>
                    <Label>נוכחי</Label>
                    <Input type="number" value={currentValue} onChange={setCurrentValue} placeholder="0" />
                  </div>
                  <div>
                    <Label>יחידה</Label>
                    <Input value={unit} onChange={setUnit} placeholder="₪ / עיריות" />
                  </div>
                </div>
              )}

              {/* Lane override (theme) */}
              <div>
                <Label>נתיב (lane)</Label>
                <Select value={theme} onChange={setTheme}>
                  <option value="">ברירת מחדל (לפי דומיין)</option>
                  {ROADMAP_LANES.map(l => (
                    <option key={l.key} value={l.key}>{l.label}</option>
                  ))}
                </Select>
              </div>
            </>
          )}

          {/* Parent goal assignment (tasks + sub-goals) */}
          <div>
            <Label>{item.isGoal ? 'יעד-אב' : 'שיוך ליעד'}</Label>
            <Select value={parentGoalId} onChange={setParentGoalId}>
              <option value="">ללא שיוך</option>
              {availableParentGoals.map(g => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </Select>
            {!item.isGoal && (
              <p className="text-[10px] text-gray-400 mt-1">
                שיוך משימה ליעד מציג אותה תחת פס-הסיכום של היעד בציר הזמן.
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 font-semibold bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-gray-50">
          {/* Delete — goals only */}
          {item.isGoal ? (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              מחק יעד
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-sm font-semibold px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-all"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              שמור
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
