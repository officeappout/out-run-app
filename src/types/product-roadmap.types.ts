/**
 * Product Roadmap & Feedback Types
 * For managing development tasks, user feedback, and app modules
 */

// Task source - who requested/created this task
export type TaskSource = 'user' | 'admin' | 'partner';

// Task priority levels
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

// Task status for kanban workflow
export type TaskStatus = 'backlog' | 'planned' | 'in_progress' | 'review' | 'done' | 'archived';

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
  backlog: 'Backlog',
  planned: 'מתוכנן',
  in_progress: 'בפיתוח',
  review: 'בבדיקה',
  done: 'הושלם',
  archived: 'ארכיון',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, { bg: string; text: string; border: string }> = {
  backlog: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
  planned: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  in_progress: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-400' },
  review: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-400' },
  done: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-400' },
  archived: { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-300' },
};

// Kanban column order
export const KANBAN_COLUMNS: TaskStatus[] = ['backlog', 'planned', 'in_progress', 'review', 'done'];
