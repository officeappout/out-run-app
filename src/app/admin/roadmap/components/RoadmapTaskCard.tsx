'use client';

import { 
  MoreVertical, 
  Edit2, 
  Trash2, 
  ChevronRight,
  User,
  Calendar,
  AlertTriangle,
  GripVertical,
} from 'lucide-react';
import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  ProductTask,
  ProductTag,
  TaskStatus,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  TASK_SOURCE_LABELS,
  TASK_SOURCE_COLORS,
  TASK_STATUS_LABELS,
} from '@/types/product-roadmap.types';

interface RoadmapTaskCardProps {
  task: ProductTask;
  tags: ProductTag[];
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  isDragging?: boolean;
}

export default function RoadmapTaskCard({
  task,
  tags,
  index,
  onEdit,
  onDelete,
  onStatusChange,
  isDragging: externalIsDragging,
}: RoadmapTaskCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging: internalIsDragging,
  } = useDraggable({
    id: task.id,
    data: {
      task,
      type: 'task',
    },
  });

  const isDragging = externalIsDragging || internalIsDragging;

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const priorityColors = TASK_PRIORITY_COLORS[task.priority];
  const sourceColors = TASK_SOURCE_COLORS[task.source];

  const formatDate = (date: Date | undefined) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'short',
    });
  };

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-lg p-3 shadow-sm border transition-all group ${
        isDragging 
          ? 'shadow-xl scale-105 border-cyan-400 ring-2 ring-cyan-200' 
          : 'hover:shadow-md cursor-grab active:cursor-grabbing'
      } ${isOverdue ? 'border-red-300 border-r-4 border-r-red-500' : 'border-gray-200'}`}
      {...attributes}
      {...listeners}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        {/* Drag Handle (visual only - whole card is draggable) */}
        <div className="flex-shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-gray-900 text-sm line-clamp-2">{task.title}</h4>
        </div>
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical size={16} />
          </button>
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20 w-32">
                <button
                  onClick={() => {
                    onEdit();
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Edit2 size={14} />
                  ערוך
                </button>
                <button
                  onClick={() => {
                    onDelete();
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  מחק
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-2">{task.description}</p>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.slice(0, 3).map(tagName => {
            const tag = tags.find(t => t.name === tagName);
            return (
              <span
                key={tagName}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{
                  backgroundColor: `${tag?.color || '#6B7280'}20`,
                  color: tag?.color || '#6B7280',
                }}
              >
                {tagName}
              </span>
            );
          })}
          {task.tags.length > 3 && (
            <span className="text-[10px] text-gray-400">+{task.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2">
          {/* Priority */}
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${priorityColors.bg} ${priorityColors.text}`}
          >
            {TASK_PRIORITY_LABELS[task.priority]}
          </span>
          {/* Source */}
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceColors.bg} ${sourceColors.text}`}
          >
            {TASK_SOURCE_LABELS[task.source]}
          </span>
        </div>

        {/* Status Quick Change */}
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700"
          >
            <ChevronRight size={12} className="rotate-90" />
          </button>
          {showStatusMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowStatusMenu(false)}
              />
              <div className="absolute left-0 bottom-full mb-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20 w-28">
                {Object.entries(TASK_STATUS_LABELS).map(([status, label]) => (
                  <button
                    key={status}
                    onClick={() => {
                      onStatusChange(task.id, status as TaskStatus);
                      setShowStatusMenu(false);
                    }}
                    className={`w-full px-3 py-1.5 text-xs text-right hover:bg-gray-50 ${
                      task.status === status ? 'font-bold text-cyan-600' : 'text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Metadata Row */}
      {(task.assignedToName || task.dueDate) && (
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-500">
          {task.assignedToName && (
            <span className="flex items-center gap-1">
              <User size={10} />
              {task.assignedToName}
            </span>
          )}
          {task.dueDate && (
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-bold' : ''}`}>
              {isOverdue && <AlertTriangle size={10} />}
              <Calendar size={10} />
              {formatDate(task.dueDate)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
