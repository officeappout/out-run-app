/**
 * Unified Roadmap Contract Types
 *
 * Read-model only — no collection backs this directly.
 * Each domain (dev, sales, marketing) remains the source of truth;
 * the service layer normalises them into RoadmapItem for the master view.
 */

export type RoadmapDomain = 'sales' | 'dev' | 'marketing' | 'events';

/** Shared 5-state status that spans all domains */
export type CommonStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';

export const COMMON_STATUS_LABELS: Record<CommonStatus, string> = {
  todo:        'לביצוע',
  in_progress: 'בתהליך',
  blocked:     'חסום',
  done:        'הושלם',
  cancelled:   'בוטל',
};

export const COMMON_STATUS_COLORS: Record<CommonStatus, { bg: string; text: string; border: string }> = {
  todo:        { bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-300'   },
  in_progress: { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-400'   },
  blocked:     { bg: 'bg-rose-100',    text: 'text-rose-700',    border: 'border-rose-400'    },
  done:        { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-400' },
  cancelled:   { bg: 'bg-gray-100',    text: 'text-gray-500',    border: 'border-gray-300'    },
};

export const DOMAIN_LABELS: Record<RoadmapDomain, string> = {
  sales:     'מכירות',
  dev:       'פיתוח',
  marketing: 'שיווק',
  events:    'אירועים',
};

export const DOMAIN_COLORS: Record<RoadmapDomain, { accent: string; bg: string; border: string }> = {
  sales:     { accent: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
  dev:       { accent: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
  marketing: { accent: 'text-pink-600',   bg: 'bg-pink-50',   border: 'border-pink-200'   },
  events:    { accent: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
};

export type RoadmapPriority = 'critical' | 'high' | 'medium' | 'low';

export interface RoadmapSourceRef {
  /** Top-level collection name */
  collection: string;
  /** Primary doc ID: task ID for dev/marketing; authority ID for sales */
  docId: string;
  /** For sales domain only: the task ID within the authority tasks[] array */
  taskId?: string;
}

export interface RoadmapItem {
  id: string;
  domain: RoadmapDomain;
  title: string;
  /** Normalised status — the contract */
  status: CommonStatus;
  /** Original domain-specific status (for drill-down display) */
  nativeStatus: string;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneePhotoURL?: string | null;
  priority: RoadmapPriority | null;
  dueDate: string | null;   // ISO string
  parentGoalId: string | null;
  sourceRef: RoadmapSourceRef;
}

// ─── Status mapping tables ────────────────────────────────────────────────────

export const DEV_TO_COMMON: Record<string, CommonStatus> = {
  feedback_inbox:  'todo',
  backlog:         'todo',
  planned:         'todo',
  in_progress:     'in_progress',
  ready_for_qa:    'in_progress',
  ready_to_merge:  'in_progress',
  review:          'in_progress',
  done:            'done',
  archived:        'cancelled',
  needs_human:     'blocked',
};

export const SALES_TO_COMMON: Record<string, CommonStatus> = {
  pending:     'todo',
  in_progress: 'in_progress',
  done:        'done',
  cancelled:   'cancelled',
};

/** For the new marketing_tasks collection (built on the contract from day 1) */
export const MARKETING_TO_COMMON: Record<string, CommonStatus> = {
  todo:        'todo',
  in_progress: 'in_progress',
  blocked:     'blocked',
  done:        'done',
  cancelled:   'cancelled',
};

// ─── Filter shape (shared between service and UI) ─────────────────────────────

export interface RoadmapFilters {
  domains?: RoadmapDomain[];
  assigneeId?: string;
  thisWeek?: boolean;
  status?: CommonStatus;
  parentGoalId?: string;
}

/** Reverse map: CommonStatus → native status for each domain (used when writing back) */
export const COMMON_TO_DEV: Record<CommonStatus, string> = {
  todo:        'planned',
  in_progress: 'in_progress',
  blocked:     'needs_human',
  done:        'done',
  cancelled:   'archived',
};

export const COMMON_TO_SALES: Record<CommonStatus, string> = {
  todo:        'pending',
  in_progress: 'in_progress',
  blocked:     'pending',
  done:        'done',
  cancelled:   'cancelled',
};
