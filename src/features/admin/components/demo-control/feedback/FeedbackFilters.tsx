'use client';
/** "משוב דמו" — the filter row: source, type, severity, status, persona, date range. */
import { LIFE_FEEDBACK_TYPES, QA_CATEGORIES, STATUS_LABEL, TRIAGE_STATUSES, TYPE_LABEL, type FeedbackType } from '@/lib/demo-control/feedback-model';
import { QA_SEVERITIES } from '@/lib/demo-control/qa-summary';
import { Button, SegmentTabs } from '@/features/admin/components/ui';
import { DEFAULT_FILTERS, type FeedbackFilterState } from './useDemoFeedback';

const inputCls =
  'h-10 w-full rounded-xl bg-white px-3 text-[14px] text-slate-900 ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400';

const SOURCE_TABS: { id: FeedbackFilterState['source']; label: string }[] = [
  { id: 'all', label: 'הכול' },
  { id: 'life', label: 'משתמשי דמו' },
  { id: 'testers', label: 'בודקי AI' },
];

function typesFor(source: FeedbackFilterState['source']): readonly FeedbackType[] {
  return source === 'life' ? LIFE_FEEDBACK_TYPES : source === 'testers' ? QA_CATEGORIES : [...LIFE_FEEDBACK_TYPES, ...QA_CATEGORIES];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block whitespace-nowrap text-[13px] font-extrabold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export default function FeedbackFilters({
  value,
  personaDraft,
  onChange,
  onPersonaDraft,
}: {
  value: FeedbackFilterState;
  /** The persona box is debounced by the parent; this is what's typed. */
  personaDraft: string;
  onChange: (next: FeedbackFilterState) => void;
  onPersonaDraft: (text: string) => void;
}) {
  const set = <K extends keyof FeedbackFilterState>(k: K, v: FeedbackFilterState[K]) => onChange({ ...value, [k]: v });
  const types = typesFor(value.source);
  const isDefault = JSON.stringify(value) === JSON.stringify(DEFAULT_FILTERS) && !personaDraft;

  return (
    <div className="space-y-3">
      <SegmentTabs
        label="מקור"
        tabs={SOURCE_TABS}
        value={value.source}
        onChange={(source) =>
          onChange({
            ...value,
            source,
            // keep only filters that still make sense for the new source
            type: (typesFor(source) as readonly string[]).includes(value.type) ? value.type : '',
            severity: source === 'life' ? '' : value.severity,
          })
        }
      />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="סוג">
          <select className={inputCls} value={value.type} onChange={(e) => set('type', e.target.value)}>
            <option value="">כל הסוגים</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="חומרה">
          <select className={inputCls} value={value.severity} disabled={value.source === 'life'} onChange={(e) => set('severity', e.target.value)}>
            <option value="">כל החומרות</option>
            {QA_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="מצב">
          <select className={inputCls} value={value.status} onChange={(e) => set('status', e.target.value as FeedbackFilterState['status'])}>
            <option value="all">הכול</option>
            {TRIAGE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="פרסונה">
          <input className={inputCls} type="search" placeholder="שם או מזהה" value={personaDraft} onChange={(e) => onPersonaDraft(e.target.value)} />
        </Field>
        <Field label="מתאריך">
          <input className={inputCls} type="date" dir="ltr" value={value.from} max={value.to || undefined} onChange={(e) => set('from', e.target.value)} />
        </Field>
        <Field label="עד תאריך">
          <input className={inputCls} type="date" dir="ltr" value={value.to} min={value.from || undefined} onChange={(e) => set('to', e.target.value)} />
        </Field>
      </div>
      {!isDefault && (
        <Button
          onClick={() => {
            onPersonaDraft('');
            onChange(DEFAULT_FILTERS);
          }}
        >
          נקה סינון
        </Button>
      )}
    </div>
  );
}
