'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  LayoutGrid,
  List,
  Tag,
  Filter,
  Search,
  X,
  MessageSquare,
  Loader2,
  Settings,
  CheckCircle,
  Clock,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import {
  ProductTask,
  ProductTag,
  UserFeedback,
  TaskStatus,
  TaskPriority,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  KANBAN_COLUMNS,
} from '@/types/product-roadmap.types';
import {
  getAllTasks,
  getAllTags,
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  initializeDefaultTags,
  getAllFeedback,
  convertFeedbackToTask,
  getRoadmapStats,
} from '@/features/admin/services/product-roadmap.service';
import { getAllSuperAdmins, AdminUser } from '@/features/admin/services/admin-management.service';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import RoadmapTaskCard from './components/RoadmapTaskCard';
import RoadmapTaskForm from './components/RoadmapTaskForm';
import TagManager from './components/TagManager';
import FeedbackPanel from './components/FeedbackPanel';

// Droppable Column Component
function DroppableColumn({ 
  id, 
  children, 
  isOver 
}: { 
  id: string; 
  children: React.ReactNode;
  isOver?: boolean;
}) {
  const { setNodeRef, isOver: internalIsOver } = useDroppable({
    id,
    data: {
      type: 'column',
      status: id,
    },
  });

  const active = isOver || internalIsOver;

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 p-2 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent transition-colors duration-200 ${
        active ? 'bg-cyan-50/50 ring-2 ring-inset ring-cyan-300 rounded-lg' : ''
      }`}
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: '#d1d5db transparent',
      }}
    >
      {children}
    </div>
  );
}

type ViewMode = 'board' | 'list';

export default function ProductRoadmapPage() {
  // Data state
  const [tasks, setTasks] = useState<ProductTask[]>([]);
  const [tags, setTags] = useState<ProductTag[]>([]);
  const [feedback, setFeedback] = useState<UserFeedback[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<{
    totalTasks: number;
    byStatus: Record<TaskStatus, number>;
    byPriority: Record<TaskPriority, number>;
    pendingFeedback: number;
  } | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<ProductTask | null>(null);
  const [feedbackToConvert, setFeedbackToConvert] = useState<UserFeedback | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Admin info
  const [adminInfo, setAdminInfo] = useState<{ adminId: string; adminName: string } | undefined>();

  // Drag & Drop state
  const [activeTask, setActiveTask] = useState<ProductTask | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Drag & Drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Minimum drag distance before activation
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Load admin info - use onAuthStateChanged to properly wait for auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log('[Roadmap] Auth state loaded, user:', user.uid);
        setAdminInfo({
          adminId: user.uid,
          adminName: user.displayName || user.email || 'Admin',
        });
      } else {
        console.log('[Roadmap] No authenticated user');
        setAdminInfo(undefined);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksData, tagsData, feedbackData, adminsData, statsData] = await Promise.all([
        getAllTasks(),
        getAllTags(),
        getAllFeedback(),
        getAllSuperAdmins(),
        getRoadmapStats(),
      ]);

      setTasks(tasksData);
      setTags(tagsData);
      setFeedback(feedbackData);
      setAdmins(adminsData);
      setStats(statsData);

      // Initialize default tags if none exist
      if (tagsData.length === 0) {
        await initializeDefaultTags();
        const updatedTags = await getAllTags();
        setTags(updatedTags);
      }
    } catch (error) {
      console.error('Error loading roadmap data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2000);
  }, []);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let filtered = tasks;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        task =>
          task.title.toLowerCase().includes(query) ||
          task.description.toLowerCase().includes(query)
      );
    }

    // Tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter(task =>
        selectedTags.some(tag => task.tags.includes(tag))
      );
    }

    return filtered;
  }, [tasks, searchQuery, selectedTags]);

  // Group tasks by status for kanban
  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, ProductTask[]> = {
      backlog: [],
      planned: [],
      in_progress: [],
      review: [],
      done: [],
      archived: [],
    };

    filteredTasks.forEach(task => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });

    // Sort by priority within each column
    const priorityOrder: TaskPriority[] = ['critical', 'high', 'medium', 'low'];
    Object.keys(grouped).forEach(status => {
      grouped[status as TaskStatus].sort((a, b) => 
        priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority)
      );
    });

    return grouped;
  }, [filteredTasks]);

  // Handlers
  const handleCreateTask = async (data: Partial<ProductTask>) => {
    console.log('[Roadmap] handleCreateTask called with data:', data);
    console.log('[Roadmap] adminInfo:', adminInfo);
    
    if (!adminInfo) {
      alert('שגיאה: לא מחובר. נא לרענן את הדף.');
      return;
    }
    
    setIsActionLoading(true);
    try {
      if (feedbackToConvert?.id || data.feedbackId) {
        const feedbackId = feedbackToConvert?.id || data.feedbackId;
        console.log('[Roadmap] Converting feedback to task:', feedbackId);
        await convertFeedbackToTask(feedbackId as string, data, adminInfo);
      } else {
        console.log('[Roadmap] Creating new task...');
        const taskId = await createTask(data as any, adminInfo);
        console.log('[Roadmap] Task created with ID:', taskId);
      }
      await loadData();
      setShowTaskForm(false);
      setFeedbackToConvert(null);
      showToast('נשמר בהצלחה');
    } catch (error: any) {
      console.error('[Roadmap] Error creating task:', error);
      alert(`שגיאה ביצירת משימה: ${error?.message || error}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateTask = async (taskId: string, data: Partial<ProductTask>) => {
    setIsActionLoading(true);
    try {
      await updateTask(taskId, data, adminInfo);
      await loadData();
      setEditingTask(null);
      setShowTaskForm(false);
      showToast('נשמר בהצלחה');
    } catch (error) {
      console.error('Error updating task:', error);
      alert('שגיאה בעדכון משימה');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('האם למחוק משימה זו?')) return;
    setIsActionLoading(true);
    try {
      await deleteTask(taskId, adminInfo);
      await loadData();
      showToast('נשמר בהצלחה');
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('שגיאה במחיקת משימה');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    setIsActionLoading(true);
    try {
      await updateTaskStatus(taskId, newStatus, adminInfo);
      // Optimistic update
      setTasks(prev =>
        prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
      showToast('נשמר בהצלחה');
    } catch (error) {
      console.error('Error updating task status:', error);
      await loadData(); // Revert on error
    } finally {
      setIsActionLoading(false);
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find(t => t.id === active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragOver = (event: any) => {
    const { over } = event;
    setOverId(over?.id ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveTask(null);
    setOverId(null);
    
    if (!over) return;
    
    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;
    const task = tasks.find(t => t.id === taskId);
    
    // Only update if dropped on a different column
    if (!task || task.status === newStatus) return;
    
    // Optimistic update - move the card immediately
    const previousTasks = [...tasks];
    setTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    
    // Update in Firestore
    try {
      await updateTaskStatus(taskId, newStatus, adminInfo);
      showToast('המשימה הועברה בהצלחה');
    } catch (error) {
      console.error('Error updating task status:', error);
      // Revert on error
      setTasks(previousTasks);
      showToast('שגיאה בעדכון המשימה');
    }
  };

  const handleDragCancel = () => {
    setActiveTask(null);
    setOverId(null);
  };

  const handleConvertFeedback = (fb: UserFeedback) => {
    setFeedbackToConvert(fb);
    setShowTaskForm(true);
  };

  const handleTagToggle = (tagName: string) => {
    setSelectedTags(prev =>
      prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  const unconvertedFeedback = feedback.filter(f => !f.isConverted);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 size={32} className="animate-spin text-cyan-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-w-0 min-h-0 flex-1" style={{ height: 'calc(100dvh - 8rem)' }} dir="rtl">
      {/* Success Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-6 left-6 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg font-bold"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header - Fixed */}
      <div className="flex-shrink-0 flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Product Roadmap</h1>
          <p className="text-gray-500 mt-1">ניהול משימות פיתוח, משוב משתמשים ומודולים</p>
        </div>
        <div className="flex items-center gap-3">
          {isActionLoading && <Loader2 size={18} className="animate-spin text-cyan-600" />}
          <button
            onClick={() => setShowFeedbackPanel(true)}
            className="relative flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-bold"
          >
            <MessageSquare size={18} />
            משוב
            {unconvertedFeedback.length > 0 && (
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unconvertedFeedback.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowTagManager(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-bold"
          >
            <Settings size={18} />
            ניהול תגיות
          </button>
          <button
            onClick={() => {
              setEditingTask(null);
              setFeedbackToConvert(null);
              setShowTaskForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-bold"
          >
            <Plus size={18} />
            משימה חדשה
          </button>
        </div>
      </div>

      {/* Stats Bar - Fixed */}
      {stats && (
        <div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 px-1">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-600">בפיתוח</p>
                <p className="text-2xl font-black text-amber-700">{stats.byStatus.in_progress}</p>
              </div>
              <Zap size={24} className="text-amber-500" />
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">קריטי</p>
                <p className="text-2xl font-black text-red-700">{stats.byPriority.critical}</p>
              </div>
              <AlertTriangle size={24} className="text-red-500" />
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">ממתין למשוב</p>
                <p className="text-2xl font-black text-blue-700">{stats.pendingFeedback}</p>
              </div>
              <MessageSquare size={24} className="text-blue-500" />
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">הושלם</p>
                <p className="text-2xl font-black text-green-700">{stats.byStatus.done}</p>
              </div>
              <CheckCircle size={24} className="text-green-500" />
            </div>
          </div>
        </div>
      )}

      {/* Filters - Fixed */}
      <div className="flex-shrink-0 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-4 mt-4 mx-1">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="חפש משימות..."
              className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('board')}
              title="תצוגת לוח"
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'board'
                  ? 'bg-white text-cyan-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="תצוגת רשימה"
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-cyan-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <List size={18} />
            </button>
          </div>
        </div>

        {/* Tag Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={16} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-600">סינון לפי תגית:</span>
          {tags.map(tag => (
            <button
              key={tag.id}
              onClick={() => handleTagToggle(tag.name)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                selectedTags.includes(tag.name)
                  ? 'ring-2 ring-offset-1'
                  : 'opacity-70 hover:opacity-100'
              }`}
              style={{
                backgroundColor: `${tag.color}20`,
                color: tag.color,
                borderColor: tag.color,
                ...(selectedTags.includes(tag.name) ? { ringColor: tag.color } : {}),
              }}
            >
              {tag.name}
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700"
            >
              נקה סינון
            </button>
          )}
        </div>
      </div>

      {/* Kanban Board View */}
      {viewMode === 'board' && (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div 
            dir="rtl"
            className="flex-1 min-h-0 min-w-0 mt-4 w-full overflow-x-auto overflow-y-hidden pb-6 scrollbar-thin"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#d1d5db #f3f4f6',
              display: 'block',
              whiteSpace: 'nowrap',
            }}
          >
            <div 
              className="inline-flex gap-4 h-full py-1 px-2"
              style={{ 
                minHeight: '100%',
              }}
            >
              {KANBAN_COLUMNS.map(status => {
                const statusTasks = tasksByStatus[status];
                const colors = TASK_STATUS_COLORS[status];
                const isColumnOver = overId === status;

                return (
                  <div 
                    key={status} 
                    className={`bg-gray-50 rounded-xl flex flex-col transition-all duration-200 ${
                      isColumnOver ? 'ring-2 ring-cyan-400 bg-cyan-50/30' : ''
                    }`}
                    style={{ 
                      flex: '0 0 320px',
                      width: '320px',
                      minWidth: '320px',
                      maxWidth: '320px',
                      height: '100%',
                      display: 'inline-flex',
                      flexDirection: 'column',
                      verticalAlign: 'top',
                      whiteSpace: 'normal',
                    }}
                  >
                    {/* Column Header */}
                    <div
                      className={`flex-shrink-0 ${colors.bg} ${colors.border} border-b-2 rounded-t-xl px-4 py-3`}
                    >
                      <div className="flex items-center justify-between">
                        <h3 className={`font-bold ${colors.text}`}>
                          {TASK_STATUS_LABELS[status]}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${colors.bg} ${colors.text} border ${colors.border}`}
                        >
                          {statusTasks.length}
                        </span>
                      </div>
                    </div>

                    {/* Column Content - Droppable */}
                    <DroppableColumn id={status} isOver={isColumnOver}>
                      {statusTasks.length === 0 ? (
                        <div className={`text-center py-8 text-sm transition-colors ${
                          isColumnOver ? 'text-cyan-500' : 'text-gray-400'
                        }`}>
                          {isColumnOver ? 'שחרר כאן' : 'אין משימות'}
                        </div>
                      ) : (
                        statusTasks.map((task, index) => (
                          <RoadmapTaskCard
                            key={task.id}
                            task={task}
                            tags={tags}
                            index={index}
                            onEdit={() => {
                              setEditingTask(task);
                              setShowTaskForm(true);
                            }}
                            onDelete={() => handleDeleteTask(task.id)}
                            onStatusChange={handleStatusChange}
                            isDragging={activeTask?.id === task.id}
                          />
                        ))
                      )}
                    </DroppableColumn>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Drag Overlay - shows the dragged card */}
          <DragOverlay>
            {activeTask ? (
              <div className="w-[300px] opacity-90">
                <RoadmapTaskCard
                  task={activeTask}
                  tags={tags}
                  index={0}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onStatusChange={() => {}}
                  isDragging={true}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="flex-1 mt-4 mx-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
              <tr>
                <th className="px-6 py-4">משימה</th>
                <th className="px-6 py-4">סטטוס</th>
                <th className="px-6 py-4">עדיפות</th>
                <th className="px-6 py-4">תגיות</th>
                <th className="px-6 py-4">אחראי</th>
                <th className="px-6 py-4">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTasks.map(task => (
                <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{task.title}</div>
                    <div className="text-sm text-gray-500 line-clamp-1">
                      {task.description}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={task.status}
                      onChange={e =>
                        handleStatusChange(task.id, e.target.value as TaskStatus)
                      }
                      className={`px-2 py-1 rounded-lg text-sm font-bold border ${TASK_STATUS_COLORS[task.status].bg} ${TASK_STATUS_COLORS[task.status].text} ${TASK_STATUS_COLORS[task.status].border}`}
                    >
                      {Object.entries(TASK_STATUS_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-lg text-sm font-bold ${TASK_PRIORITY_COLORS[task.priority].bg} ${TASK_PRIORITY_COLORS[task.priority].text}`}
                    >
                      {TASK_PRIORITY_LABELS[task.priority]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {task.tags.slice(0, 3).map(tagName => {
                        const tag = tags.find(t => t.name === tagName);
                        return (
                          <span
                            key={tagName}
                            className="px-2 py-0.5 rounded-full text-xs font-medium"
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
                        <span className="text-xs text-gray-400">
                          +{task.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {task.assignedToName || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingTask(task);
                          setShowTaskForm(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                      >
                        ערוך
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="text-red-600 hover:text-red-800 font-medium text-sm"
                      >
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTasks.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Clock size={32} className="mx-auto mb-2 opacity-50" />
              <p>אין משימות להצגה</p>
            </div>
          )}
        </div>
      )}

      {/* Task Form Modal */}
      <AnimatePresence>
        {showTaskForm && (
          <RoadmapTaskForm
            task={editingTask}
            tags={tags}
            admins={admins}
            feedbackToConvert={feedbackToConvert}
            onSave={editingTask ? data => handleUpdateTask(editingTask.id, data) : handleCreateTask}
            onClose={() => {
              setShowTaskForm(false);
              setEditingTask(null);
              setFeedbackToConvert(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Tag Manager Modal */}
      <AnimatePresence>
        {showTagManager && (
          <TagManager
            tags={tags}
            onClose={() => setShowTagManager(false)}
            onRefresh={loadData}
            adminInfo={adminInfo}
            onSuccess={() => showToast('נשמר בהצלחה')}
          />
        )}
      </AnimatePresence>

      {/* Feedback Panel */}
      <AnimatePresence>
        {showFeedbackPanel && (
          <FeedbackPanel
            feedback={feedback}
            onClose={() => setShowFeedbackPanel(false)}
            onConvert={handleConvertFeedback}
            onRefresh={loadData}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
