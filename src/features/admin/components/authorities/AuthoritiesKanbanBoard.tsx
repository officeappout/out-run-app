'use client';

import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Building2, Phone, AlertCircle, User } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  Authority,
  PipelineStatus,
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUS_COLORS,
  getPrimaryContact,
  hasOverdueTasks,
} from '@/types/admin-types';
import { updatePipelineStatus } from '@/features/admin/services/authority.service';

interface AuthoritiesKanbanBoardProps {
  authorities: Authority[];
  onOpenDrawer: (authority: Authority) => void;
  ownerFilter?: string; // Filter by responsible manager ID
  pipelineStatusFilter?: PipelineStatus | 'all';
  adminInfo?: { adminId: string; adminName: string };
  onAuthorityUpdated?: () => void;
}

// Pipeline status order for columns
const PIPELINE_ORDER: PipelineStatus[] = ['lead', 'meeting', 'quote', 'follow_up', 'closing', 'active'];

export default function AuthoritiesKanbanBoard({
  authorities,
  onOpenDrawer,
  ownerFilter,
  pipelineStatusFilter = 'all',
  adminInfo,
  onAuthorityUpdated,
}: AuthoritiesKanbanBoardProps) {
  const [boardAuthorities, setBoardAuthorities] = useState<Authority[]>(authorities);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setBoardAuthorities(authorities);
  }, [authorities]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Filter and group authorities by pipeline status
  const columns = useMemo(() => {
    // Filter only top-level authorities
    let filtered = boardAuthorities.filter(a => !a.parentAuthorityId);
    
    // Apply owner filter if set
    if (ownerFilter) {
      filtered = filtered.filter(a => a.managerIds?.includes(ownerFilter));
    }

    // Apply pipeline status filter if set
    if (pipelineStatusFilter !== 'all') {
      filtered = filtered.filter(a => (a.pipelineStatus || 'lead') === pipelineStatusFilter);
    }
    
    // Group by pipeline status
    const grouped: Record<PipelineStatus, Authority[]> = {
      lead: [],
      meeting: [],
      quote: [],
      follow_up: [],
      closing: [],
      active: [],
      upsell: [],
    };
    
    filtered.forEach(auth => {
      const status = auth.pipelineStatus || 'lead';
      if (grouped[status]) {
        grouped[status].push(auth);
      }
    });
    
    return PIPELINE_ORDER.map(status => ({
      status,
      label: PIPELINE_STATUS_LABELS[status],
      colors: PIPELINE_STATUS_COLORS[status],
      authorities: grouped[status],
    }));
  }, [boardAuthorities, ownerFilter, pipelineStatusFilter]);

  const activeAuthority = useMemo(
    () => boardAuthorities.find(a => a.id === activeId) || null,
    [boardAuthorities, activeId]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith('column-')) return;

    const newStatus = overId.replace('column-', '') as PipelineStatus;
    const draggedAuthority = boardAuthorities.find(a => a.id === active.id);
    if (!draggedAuthority) return;

    const currentStatus = draggedAuthority.pipelineStatus || 'lead';
    if (currentStatus === newStatus) return;

    setBoardAuthorities(prev =>
      prev.map(a => (a.id === draggedAuthority.id ? { ...a, pipelineStatus: newStatus } : a))
    );

    try {
      await updatePipelineStatus(draggedAuthority.id, newStatus, adminInfo);
      onAuthorityUpdated?.();
    } catch (error) {
      console.error('Error updating pipeline status:', error);
      setBoardAuthorities(prev =>
        prev.map(a =>
          a.id === draggedAuthority.id ? { ...a, pipelineStatus: currentStatus } : a
        )
      );
      alert('שגיאה בעדכון סטטוס הליד');
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4" dir="rtl">
        {columns.map((column) => (
          <KanbanColumn
            key={column.status}
            column={column}
            onOpenDrawer={onOpenDrawer}
          />
        ))}
      </div>
      <DragOverlay>
        {activeAuthority ? (
          <KanbanCardContent authority={activeAuthority} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface KanbanCardProps {
  authority: Authority;
  index: number;
  onClick: () => void;
}

function KanbanCard({ authority, index, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: authority.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className={`${isDragging ? 'opacity-70' : ''}`}
      {...listeners}
      {...attributes}
    >
      <KanbanCardContent authority={authority} />
    </motion.div>
  );
}

function KanbanCardContent({ authority, isDragging = false }: { authority: Authority; isDragging?: boolean }) {
  const primaryContact = getPrimaryContact(authority);
  const hasOverdue = hasOverdueTasks(authority);
  const openTasksCount = authority.tasks?.filter(
    t => t.status !== 'done' && t.status !== 'cancelled'
  ).length || 0;
  
  // Get unique assignees from tasks
  const assignees = useMemo(() => {
    const names = new Set<string>();
    authority.tasks?.forEach(task => {
      if (task.assignedToName && task.status !== 'done' && task.status !== 'cancelled') {
        names.add(task.assignedToName);
      }
    });
    return Array.from(names);
  }, [authority.tasks]);

  return (
    <div
      className={`bg-white rounded-lg p-3 shadow-sm border cursor-pointer transition-all ${
        hasOverdue ? 'border-red-300 border-l-4 border-l-red-500' : 'border-gray-200'
      } ${isDragging ? 'shadow-lg' : 'hover:shadow-md hover:-translate-y-0.5'}`}
    >
      {/* Authority Name & Logo */}
      <div className="flex items-start gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
          {authority.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={authority.logoUrl}
              alt={authority.name}
              className="w-8 h-8 rounded-lg object-cover"
            />
          ) : (
            <Building2 size={14} className="text-gray-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-gray-900 text-sm truncate">{authority.name}</h4>
          {authority.isActiveClient && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">
              לקוח פעיל
            </span>
          )}
        </div>
        {hasOverdue && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold flex-shrink-0">
            <AlertCircle size={12} />
            באיחור
          </span>
        )}
      </div>

      {/* Primary Contact */}
      {primaryContact && (
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
          <User size={12} className="text-gray-400" />
          <span className="truncate">{primaryContact.name}</span>
          {primaryContact.phone && (
            <a
              href={`tel:${primaryContact.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="text-gray-400 hover:text-cyan-600"
            >
              <Phone size={12} />
            </a>
          )}
        </div>
      )}

      {/* Footer: Tasks & Assignees */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        {openTasksCount > 0 && (
          <span className={`text-xs font-medium ${hasOverdue ? 'text-red-600' : 'text-gray-500'}`}>
            {openTasksCount} משימות
          </span>
        )}
        
        {assignees.length > 0 && (
          <div className="flex items-center gap-1">
            {assignees.slice(0, 2).map((name, i) => (
              <span
                key={i}
                className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center"
                title={name}
              >
                {name.charAt(0)}
              </span>
            ))}
            {assignees.length > 2 && (
              <span className="text-[10px] text-gray-400">+{assignees.length - 2}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({
  column,
  onOpenDrawer,
}: {
  column: {
    status: PipelineStatus;
    label: string;
    colors: { bg: string; text: string; border: string };
    authorities: Authority[];
  };
  onOpenDrawer: (authority: Authority) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `column-${column.status}` });

  return (
    <div ref={setNodeRef} className="flex-shrink-0 w-72 bg-gray-50 rounded-xl">
      {/* Column Header */}
      <div className={`sticky top-0 ${column.colors.bg} ${column.colors.border} border-b-2 rounded-t-xl px-4 py-3`}>
        <div className="flex items-center justify-between">
          <h3 className={`font-bold ${column.colors.text}`}>{column.label}</h3>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${column.colors.bg} ${column.colors.text} border ${column.colors.border}`}>
            {column.authorities.length}
          </span>
        </div>
      </div>

      {/* Column Content */}
      <div className="p-2 space-y-2 min-h-[400px] max-h-[600px] overflow-y-auto">
        {column.authorities.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            אין רשויות
          </div>
        ) : (
          column.authorities.map((authority, index) => (
            <KanbanCard
              key={authority.id}
              authority={authority}
              index={index}
              onClick={() => onOpenDrawer(authority)}
            />
          ))
        )}
      </div>
    </div>
  );
}
