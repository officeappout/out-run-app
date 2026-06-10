/**
 * Product Roadmap & Feedback Types
 * For managing development tasks, user feedback, and app modules
 */

// Task source - who requested/created this task
export type TaskSource = 'user' | 'admin' | 'partner';

// Task priority levels
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

// Task status for kanban workflow
export type TaskStatus = 'feedback_inbox' | 'backlog' | 'planned' | 'in_progress' | 'ready_for_qa' | 'ready_to_merge' | 'review' | 'done' | 'archived' | 'needs_human'; // AGENT-FIX: added needs_human (escalation terminal state from Fix 1)

// Product Task interface
export interface ProductTask {
  id: string;
  title: string;
  description: string;
  source: TaskSource;
  priority: TaskPriority;
  status: TaskStatus;
  tags: string[];
  
  // Optional fields
  feedbackId?: string; // Link to original feedback if converted
  originalFeedback?: string; // Verbatim user quote, set by amit-loop AI pipeline
  assignedTo?: string;
  assignedToName?: string;
  estimatedHours?: number;
  dueDate?: Date;
  
  // Metadata
  createdBy?: string;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Tag definition for tag manager
export interface ProductTag {
  id: string;
  name: string;
  color: string; // Hex color for badge
  createdAt: Date;
}

// User feedback that can be converted to tasks
export interface UserFeedback {
  id: string;
  content: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  category?: string;
  isConverted: boolean; // True if converted to a task
  convertedTaskId?: string;
  createdAt: Date;
}

// Default tags for the system
export const DEFAULT_TAGS: Omit<ProductTag, 'id' | 'createdAt'>[] = [
  { name: 'ממשק ריצה', color: '#10B981' }, // Green
  { name: 'ממשק כוח', color: '#F59E0B' }, // Amber
  { name: 'מבט על האימון', color: '#3B82F6' }, // Blue
  { name: 'ניהול רשויות', color: '#8B5CF6' }, // Purple
  { name: 'Onboarding', color: '#EC4899' }, // Pink
  { name: 'Bug Fix', color: '#EF4444' }, // Red
  { name: 'UI/UX', color: '#06B6D4' }, // Cyan
  { name: 'Performance', color: '#F97316' }, // Orange
  { name: 'Analytics', color: '#6366F1' }, // Indigo
];

// Labels for task source
export const TASK_SOURCE_LABELS: Record<TaskSource, string> = {
  user: 'משוב משתמש',
  admin: 'צוות פיתוח',
  partner: 'שותף/רשות',
};

export const TASK_SOURCE_COLORS: Record<TaskSource, { bg: string; text: string }> = {
  user: { bg: 'bg-blue-100', text: 'text-blue-700' },
  admin: { bg: 'bg-purple-100', text: 'text-purple-700' },
  partner: { bg: 'bg-green-100', text: 'text-green-700' },
};

// Labels for task priority
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: 'קריטי',
  high: 'גבוה',
  medium: 'בינוני',
  low: 'נמוך',
};

export const TASK_PRIORITY_COLORS: Record<TaskPriority, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-400' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-400' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-400' },
  low: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-400' },
};

// Labels for task status
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  feedback_inbox:  '📥 קול המשתמש',
  backlog:         'Backlog',
  planned:         'מתוכנן',
  in_progress:     'בפיתוח',
  ready_for_qa:    '🧪 QA אוטומטי',
  ready_to_merge:  '✅ מוכן למיזוג',
  review:          'בבדיקה',
  done:            'הושלם',
  archived:        'ארכיון',
  needs_human:     '🚨 נדרש טיפול אנושי', // AGENT-FIX
};

export const TASK_STATUS_COLORS: Record<TaskStatus, { bg: string; text: string; border: string }> = {
  feedback_inbox:  { bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-400'  },
  backlog:         { bg: 'bg-gray-100',    text: 'text-gray-700',    border: 'border-gray-300'    },
  planned:         { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-300'    },
  in_progress:     { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-400'   },
  ready_for_qa:    { bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-400'  },
  ready_to_merge:  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-400' },
  review:          { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-400'  },
  done:            { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-400'   },
  archived:        { bg: 'bg-slate-100',   text: 'text-slate-500',   border: 'border-slate-300'   },
  needs_human:     { bg: 'bg-rose-100',    text: 'text-rose-700',    border: 'border-rose-500'    }, // AGENT-FIX
};

// Kanban column order
// feedback_inbox  → AI intake (amit-loop.js)
// ready_for_qa    → automated lint/type check (qa-agent.js picks up)
// ready_to_merge  → QA passed, awaiting human merge
export const KANBAN_COLUMNS: TaskStatus[] = [
  'feedback_inbox',
  'backlog',
  'planned',
  'in_progress',
  'ready_for_qa',
  'ready_to_merge',
  'review',
  'done',
  'needs_human', // AGENT-FIX: escalation column — visible so admins can spot stuck tasks
];
