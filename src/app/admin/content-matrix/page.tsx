'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getAllExercises,
  getContentMatrixData,
  analyzeExerciseForMatrix,
  generateTaskList,
  markMethodAsFilmed,
  updateMethodWorkflow,
  CONTENT_LOCATIONS,
  ContentMatrixRow,
  ContentMatrixLocation,
  TaskListSummary,
  WorkflowStep,
  MethodProductionStatus,
  ContentMatrixGap,
} from '@/features/content/exercises';
import { ExecutionLocation } from '@/features/content/exercises';
import {
  Film,
  Mic,
  Scissors,
  Upload,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
  Camera,
  Smartphone,
  Filter,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Search,
  X,
} from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================

const LOCATION_LABELS: Record<ExecutionLocation, string> = {
  home: '🏠 בית',
  park: '🌳 פארק',
  office: '🏢 משרד',
  gym: '💪 ג\'ים',
  street: '🛣️ רחוב',
  school: '🏫 בית ספר',
  airport: '✈️ שדה תעופה',
};

const WORKFLOW_LABELS: Record<WorkflowStep, { icon: React.ReactNode; label: string; abbr: string }> = {
  filmed: { icon: <Film size={14} />, label: 'צולם', abbr: 'צ' },
  audio: { icon: <Mic size={14} />, label: 'קולט', abbr: 'ק' },
  edited: { icon: <Scissors size={14} />, label: 'ערוך', abbr: 'ע' },
  uploaded: { icon: <Upload size={14} />, label: 'הועלה', abbr: 'ה' },
};

// ============================================================================
// WORKFLOW PROGRESS BAR COMPONENT
// ============================================================================

function WorkflowProgressBar({
  workflow,
  needsLongExplanation,
  explanationStatus,
  onUpdate,
  disabled,
}: {
  workflow: ContentMatrixLocation['workflow'];
  needsLongExplanation: boolean;
  explanationStatus: 'missing' | 'ready' | null;
  onUpdate?: (step: WorkflowStep, completed: boolean) => void;
  disabled?: boolean;
}) {
  const steps: WorkflowStep[] = ['filmed', 'audio', 'edited', 'uploaded'];
  
  const getStepColor = (step: WorkflowStep, completed: boolean, prevCompleted: boolean) => {
    if (completed) return 'bg-green-500 text-white';
    if (prevCompleted) return 'bg-amber-400 text-white'; // In progress
    return 'bg-gray-200 text-gray-500';
  };
  
  return (
    <div className="flex items-center gap-0.5">
      {steps.map((step, idx) => {
        const completed = workflow[step];
        const prevCompleted = idx === 0 ? true : workflow[steps[idx - 1]];
        const info = WORKFLOW_LABELS[step];
        
        return (
          <button
            key={step}
            onClick={() => !disabled && onUpdate?.(step, !completed)}
            disabled={disabled}
            className={`
              w-7 h-7 flex items-center justify-center text-xs font-bold rounded
              transition-all duration-200
              ${getStepColor(step, completed, prevCompleted)}
              ${!disabled ? 'hover:scale-110 hover:shadow-md cursor-pointer' : 'cursor-default'}
            `}
            title={`${info.label} - ${completed ? 'בוצע' : 'לא בוצע'}`}
          >
            {info.abbr}
          </button>
        );
      })}
      
      {/* Long explanation indicator */}
      {needsLongExplanation && (
        <span
          className={`
            w-7 h-7 flex items-center justify-center text-xs rounded ml-1
            ${explanationStatus === 'ready' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}
          `}
          title={explanationStatus === 'ready' ? 'הסבר מוכן' : 'חסר הסבר ארוך'}
        >
          🎙️
        </span>
      )}
    </div>
  );
}

// ============================================================================
// LOCATION CELL COMPONENT
// ============================================================================

/**
 * Get background styling based on production status
 */
function getProductionStatusStyling(status: MethodProductionStatus, hasMedia: boolean): {
  bg: string;
  border: string;
  statusLabel: string;
} {
  if (status === 'ready') {
    return {
      bg: 'bg-green-50',
      border: 'border-green-300',
      statusLabel: 'מוכן ✓',
    };
  }
  if (status === 'in_post_production') {
    return {
      bg: 'bg-amber-50',
      border: 'border-amber-300',
      statusLabel: 'בפוסט-פרודקשן',
    };
  }
  if (status === 'needs_media') {
    return {
      bg: 'bg-red-50',
      border: 'border-red-300',
      statusLabel: 'חסרה מדיה',
    };
  }
  // not_started
  return {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    statusLabel: 'לא התחיל',
  };
}

/**
 * Renders a single method within a location cell
 */
function SingleMethodCard({
  data,
  onUpdateWorkflow,
  fieldRecordingMode,
  isCompact,
}: {
  data: ContentMatrixLocation;
  onUpdateWorkflow?: (methodIndex: number, step: WorkflowStep, completed: boolean) => void;
  fieldRecordingMode: boolean;
  isCompact?: boolean;
}) {
  const hasMedia = data.hasVideo || data.hasImage;
  const styling = getProductionStatusStyling(data.productionStatus, hasMedia);
  
  if (fieldRecordingMode) {
    // Field Recording Mode - Large touch-friendly button
    if (data.productionStatus === 'ready') {
      return (
        <div className={`w-full flex flex-col items-center justify-center rounded-lg bg-green-100 text-green-700 ${isCompact ? 'py-2' : 'min-h-[80px]'}`}>
          <CheckCircle size={isCompact ? 18 : 28} />
          <span className={`mt-1 font-bold ${isCompact ? 'text-[9px]' : 'text-xs'}`}>מוכן ✓</span>
          {isCompact && <span className="text-[8px] text-green-600 truncate max-w-full px-1">{data.methodName}</span>}
        </div>
      );
    }
    
    if (data.productionStatus === 'in_post_production') {
      return (
        <div className={`w-full flex flex-col items-center justify-center rounded-lg bg-amber-100 text-amber-700 ${isCompact ? 'py-2' : 'min-h-[80px]'}`}>
          <Scissors size={isCompact ? 18 : 28} />
          <span className={`mt-1 font-bold ${isCompact ? 'text-[9px]' : 'text-xs'}`}>בעריכה</span>
          {isCompact && <span className="text-[8px] text-amber-600 truncate max-w-full px-1">{data.methodName}</span>}
        </div>
      );
    }
    
    // Needs filming or needs media
    return (
      <button
        onClick={() => !data.workflow.filmed && onUpdateWorkflow?.(data.methodIndex, 'filmed', true)}
        disabled={data.workflow.filmed}
        className={`
          w-full flex flex-col items-center justify-center rounded-lg
          transition-all duration-200 font-bold
          ${isCompact ? 'py-2' : 'min-h-[80px]'}
          ${data.workflow.filmed 
            ? 'bg-amber-100 text-amber-700 cursor-default' 
            : 'bg-red-50 text-red-700 hover:bg-red-100 active:scale-95 cursor-pointer border-2 border-dashed border-red-300'
          }
        `}
      >
        {data.workflow.filmed ? (
          <>
            <Film size={isCompact ? 18 : 28} />
            <span className={`mt-1 ${isCompact ? 'text-[9px]' : 'text-xs'}`}>צולם - בעריכה</span>
          </>
        ) : (
          <>
            <Camera size={isCompact ? 18 : 28} />
            <span className={`mt-1 ${isCompact ? 'text-[9px]' : 'text-xs'}`}>לחץ לסימון צולם</span>
          </>
        )}
        {isCompact && <span className="text-[8px] opacity-75 truncate max-w-full px-1">{data.methodName}</span>}
      </button>
    );
  }
  
  // Regular view - show workflow progress with status indicator
  return (
    <div className={`rounded-lg border ${styling.bg} ${styling.border} ${isCompact ? 'p-1.5' : 'p-2'}`}>
      {/* Status indicator */}
      <div className="flex items-center justify-between mb-1">
        <span className={`font-bold ${isCompact ? 'text-[9px]' : 'text-[10px]'} ${
          data.productionStatus === 'ready' ? 'text-green-700' :
          data.productionStatus === 'in_post_production' ? 'text-amber-700' :
          data.productionStatus === 'needs_media' ? 'text-red-600' :
          'text-gray-500'
        }`}>
          {styling.statusLabel}
        </span>
        {data.productionStatus === 'needs_media' && (
          <AlertTriangle size={isCompact ? 10 : 12} className="text-red-500" />
        )}
      </div>
      
      <WorkflowProgressBar
        workflow={data.workflow}
        needsLongExplanation={data.needsLongExplanation}
        explanationStatus={data.explanationStatus}
        onUpdate={(step, completed) => onUpdateWorkflow?.(data.methodIndex, step, completed)}
      />
      <p className={`text-gray-500 mt-1 truncate ${isCompact ? 'text-[9px]' : 'text-[10px]'}`} title={data.methodName}>
        {data.methodName}
      </p>
    </div>
  );
}

/**
 * LocationCell now supports multiple methods per location.
 * Displays all methods stacked vertically if there are multiple.
 */
function LocationCell({
  location,
  methods,
  isRequired,
  onAddMethod,
  onUpdateWorkflow,
  fieldRecordingMode,
}: {
  location: ExecutionLocation;
  methods: ContentMatrixLocation[];
  isRequired: boolean;
  onAddMethod?: () => void;
  onUpdateWorkflow?: (methodIndex: number, step: WorkflowStep, completed: boolean) => void;
  fieldRecordingMode: boolean;
}) {
  // No methods exist for this location
  if (methods.length === 0) {
    // Different styling based on whether location is required or optional
    if (isRequired) {
      // RED - Missing required method (strategic gap)
      return (
        <button
          onClick={onAddMethod}
          className="w-full h-full min-h-[60px] flex flex-col items-center justify-center bg-red-50 border-2 border-dashed border-red-300 rounded-lg hover:bg-red-100 transition-colors group"
          title="חסרה שיטת ביצוע נדרשת"
        >
          <Plus size={18} className="text-red-500 group-hover:text-red-700" />
          <span className="text-[10px] text-red-600 font-medium mt-1">נדרש</span>
        </button>
      );
    }
    // GREY - Optional location, just show add button without error styling
    return (
      <button
        onClick={onAddMethod}
        className="w-full h-full min-h-[60px] flex flex-col items-center justify-center bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors group"
        title="הוסף שיטת ביצוע (אופציונלי)"
      >
        <Plus size={18} className="text-gray-400 group-hover:text-gray-600" />
        <span className="text-[10px] text-gray-400 font-medium mt-1">הוסף</span>
      </button>
    );
  }
  
  // Single method - display normally
  if (methods.length === 1) {
    return (
      <SingleMethodCard
        data={methods[0]}
        onUpdateWorkflow={onUpdateWorkflow}
        fieldRecordingMode={fieldRecordingMode}
        isCompact={false}
      />
    );
  }
  
  // Multiple methods - display stacked with compact styling
  return (
    <div className="space-y-1.5">
      {/* Header showing count of methods */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[9px] font-bold text-indigo-600">{methods.length} שיטות</span>
        <button
          onClick={onAddMethod}
          className="p-0.5 text-gray-400 hover:text-indigo-500 transition-colors"
          title="הוסף שיטה נוספת"
        >
          <Plus size={12} />
        </button>
      </div>
      {/* Stack of method cards */}
      {methods.map((method, idx) => (
        <SingleMethodCard
          key={`${method.methodIndex}-${idx}`}
          data={method}
          onUpdateWorkflow={onUpdateWorkflow}
          fieldRecordingMode={fieldRecordingMode}
          isCompact={true}
        />
      ))}
    </div>
  );
}

// ============================================================================
// GAP ANALYSIS BADGE
// ============================================================================

function GapBadge({ 
  gapsDetailed, 
  criticalCount, 
  workflowCount 
}: { 
  gapsDetailed: ContentMatrixGap[];
  criticalCount: number;
  workflowCount: number;
}) {
  if (gapsDetailed.length === 0) return null;
  
  // Show different badge styling based on gap types
  const hasCritical = criticalCount > 0;
  
  return (
    <div className="relative group flex items-center gap-1">
      {/* Critical gaps (red) */}
      {criticalCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">
          <XCircle size={12} />
          {criticalCount}
        </span>
      )}
      {/* Workflow gaps (amber) */}
      {workflowCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
          <AlertTriangle size={12} />
          {workflowCount}
        </span>
      )}
      <div className="absolute left-0 top-full mt-1 hidden group-hover:block z-50">
        <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg max-w-xs">
          {gapsDetailed.map((gap, idx) => (
            <div key={idx} className={`py-0.5 flex items-center gap-2 ${
              gap.type === 'missing_media' || gap.type === 'missing_required_method' 
                ? 'text-red-300' 
                : 'text-amber-300'
            }`}>
              {gap.type === 'missing_media' || gap.type === 'missing_required_method' 
                ? <XCircle size={10} /> 
                : <AlertTriangle size={10} />
              }
              {gap.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STATUS BADGE
// ============================================================================

function StatusBadge({ status }: { status: 'complete' | 'partial' | 'missing' }) {
  const config = {
    complete: { bg: 'bg-green-100', text: 'text-green-700', icon: <CheckCircle size={12} /> },
    partial: { bg: 'bg-amber-100', text: 'text-amber-700', icon: <AlertTriangle size={12} /> },
    missing: { bg: 'bg-red-100', text: 'text-red-700', icon: <XCircle size={12} /> },
  };
  
  const { bg, text, icon } = config[status];
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${bg} ${text} rounded-full text-xs font-bold`}>
      {icon}
    </span>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ContentMatrixPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ContentMatrixRow[]>([]);
  const [fieldRecordingMode, setFieldRecordingMode] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [currentLocationFilter, setCurrentLocationFilter] = useState<ExecutionLocation | 'all'>('all');
  const [showGapsOnly, setShowGapsOnly] = useState(false);
  const [workflowFilter, setWorkflowFilter] = useState<'all' | 'not_filmed' | 'filmed_not_edited' | 'edited_not_uploaded'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'in_post_production' | 'needs_media'>('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [updating, setUpdating] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    loadData();
  }, [refreshKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getContentMatrixData();
      setRows(data);
    } catch (error) {
      console.error('Error loading content matrix:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    let result = rows;
    
    // Search filter - filter by exercise name
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter((row) => row.name.toLowerCase().includes(lowerSearch));
    }
    
    // Location filter - only show exercises that have at least one method for the selected location
    if (currentLocationFilter !== 'all') {
      result = result.filter((row) => {
        const locMethods = row.locations[currentLocationFilter];
        return locMethods && locMethods.length > 0;
      });
    }
    
    // Production Status filter - filter by method production status
    if (statusFilter !== 'all') {
      result = result.filter((row) => {
        // Check locations based on current location filter
        const locationsToCheck = currentLocationFilter !== 'all' 
          ? [currentLocationFilter] 
          : CONTENT_LOCATIONS;
        
        for (const loc of locationsToCheck) {
          const locMethods = row.locations[loc];
          for (const locData of locMethods) {
            if (locData.productionStatus === statusFilter) return true;
          }
        }
        return false;
      });
    }
    
    // Gaps filter - only show exercises with critical gaps (missing media or required methods)
    if (showGapsOnly) {
      result = result.filter((row) => row.criticalGapCount > 0);
    }
    
    // Workflow filter
    if (workflowFilter !== 'all') {
      result = result.filter((row) => {
        // Check locations based on current location filter
        const locationsToCheck = currentLocationFilter !== 'all' 
          ? [currentLocationFilter] 
          : CONTENT_LOCATIONS;
        
        for (const loc of locationsToCheck) {
          const locMethods = row.locations[loc];
          for (const locData of locMethods) {
            if (workflowFilter === 'not_filmed' && !locData.workflow.filmed) return true;
            if (workflowFilter === 'filmed_not_edited' && locData.workflow.filmed && !locData.workflow.edited) return true;
            if (workflowFilter === 'edited_not_uploaded' && locData.workflow.edited && !locData.workflow.uploaded) return true;
          }
        }
        return false;
      });
    }
    
    return result;
  }, [rows, searchTerm, currentLocationFilter, statusFilter, showGapsOnly, workflowFilter]);

  // Stats - computed from filteredRows so they reflect current filters
  const stats = useMemo(() => {
    const total = filteredRows.length;
    const withCriticalGaps = filteredRows.filter((r) => r.criticalGapCount > 0).length;
    const withWorkflowGaps = filteredRows.filter((r) => r.workflowGapCount > 0).length;
    const readyCount = filteredRows.filter((r) => r.criticalGapCount === 0 && r.workflowGapCount === 0).length;
    
    let totalMethods = 0;
    let filmedCount = 0;
    let editedCount = 0;
    let uploadedCount = 0;
    let readyMethodCount = 0;
    let inPostProduction = 0;
    let needsMedia = 0;
    
    // Determine which locations to count based on current filter
    const locationsToCount = currentLocationFilter !== 'all' 
      ? [currentLocationFilter] 
      : CONTENT_LOCATIONS;
    
    for (const row of filteredRows) {
      for (const loc of locationsToCount) {
        const locMethods = row.locations[loc];
        // Now iterates over ALL methods at each location
        for (const locData of locMethods) {
          totalMethods++;
          if (locData.workflow.filmed) filmedCount++;
          if (locData.workflow.edited) editedCount++;
          if (locData.workflow.uploaded) uploadedCount++;
          if (locData.productionStatus === 'ready') readyMethodCount++;
          if (locData.productionStatus === 'in_post_production') inPostProduction++;
          if (locData.productionStatus === 'needs_media') needsMedia++;
        }
      }
    }
    
    return {
      total,
      withCriticalGaps,
      withWorkflowGaps,
      readyCount,
      totalMethods,
      filmedCount,
      editedCount,
      uploadedCount,
      readyMethodCount,
      inPostProduction,
      needsMedia,
    };
  }, [filteredRows, currentLocationFilter]);

  // Handle workflow update
  const handleWorkflowUpdate = useCallback(async (
    exerciseId: string,
    methodIndex: number,
    step: WorkflowStep,
    completed: boolean
  ) => {
    const key = `${exerciseId}-${methodIndex}-${step}`;
    setUpdating(key);
    
    try {
      await updateMethodWorkflow(exerciseId, methodIndex, step, completed);
      // Update local state
      setRows((prev) => prev.map((row) => {
        if (row.exerciseId !== exerciseId) return row;
        return analyzeExerciseForMatrix(row.exercise);
      }));
      // Refresh data to get latest
      setRefreshKey((k) => k + 1);
    } catch (error) {
      console.error('Error updating workflow:', error);
      alert('שגיאה בעדכון הסטטוס');
    } finally {
      setUpdating(null);
    }
  }, []);

  // Generate task list
  const handleExportTaskList = useCallback(() => {
    const selectedRowsData = selectedRows.size > 0
      ? filteredRows.filter((r) => selectedRows.has(r.exerciseId))
      : filteredRows;
    
    const taskList = generateTaskList(selectedRowsData);
    
    const lines: string[] = [];
    lines.push('='.repeat(60));
    lines.push('OUT Master Production Hub - Task List');
    lines.push(`Generated: ${new Date().toLocaleString('he-IL')}`);
    lines.push('='.repeat(60));
    lines.push('');
    
    if (taskList.forFilming.length > 0) {
      lines.push(`📹 GAL - צילום (${taskList.forFilming.length} פריטים)`);
      lines.push('-'.repeat(40));
      taskList.forFilming.forEach((item) => {
        lines.push(`  • ${item.exerciseName} @ ${LOCATION_LABELS[item.location]}`);
      });
      lines.push('');
    }
    
    if (taskList.forAudio.length > 0) {
      lines.push(`🎙️ הקלטת אודיו (${taskList.forAudio.length} פריטים)`);
      lines.push('-'.repeat(40));
      taskList.forAudio.forEach((item) => {
        lines.push(`  • ${item.exerciseName} @ ${LOCATION_LABELS[item.location]}`);
      });
      lines.push('');
    }
    
    if (taskList.forEditing.length > 0) {
      lines.push(`✂️ EDITOR - עריכה (${taskList.forEditing.length} פריטים)`);
      lines.push('-'.repeat(40));
      taskList.forEditing.forEach((item) => {
        lines.push(`  • ${item.exerciseName} @ ${LOCATION_LABELS[item.location]}`);
      });
      lines.push('');
    }
    
    if (taskList.forUpload.length > 0) {
      lines.push(`📤 העלאה (${taskList.forUpload.length} פריטים)`);
      lines.push('-'.repeat(40));
      taskList.forUpload.forEach((item) => {
        lines.push(`  • ${item.exerciseName} @ ${LOCATION_LABELS[item.location]}`);
      });
    }
    
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production-tasks-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRows, selectedRows]);

  // Toggle row selection
  const toggleRowSelection = (exerciseId: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) {
        next.delete(exerciseId);
      } else {
        next.add(exerciseId);
      }
      return next;
    });
  };

  // Select all visible
  const selectAllVisible = () => {
    setSelectedRows(new Set(filteredRows.map((r) => r.exerciseId)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedRows(new Set());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 p-6 rounded-2xl shadow-lg text-white">
        <div>
          <h1 className="text-3xl font-black">OUT Master Production Hub</h1>
          <p className="text-indigo-100 mt-1">ניהול תהליך הפקה מלא: צילום → קול → עריכה → העלאה</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setFieldRecordingMode(!fieldRecordingMode)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all
              ${fieldRecordingMode 
                ? 'bg-amber-400 text-amber-900 shadow-lg scale-105' 
                : 'bg-white/20 hover:bg-white/30'
              }
            `}
          >
            <Smartphone size={18} />
            {fieldRecordingMode ? 'מצב שטח פעיל' : 'מצב שטח'}
          </button>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-bold transition-all"
          >
            <RefreshCw size={18} />
            רענון
          </button>
        </div>
      </div>

      {/* Stats Bar - updates based on current filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-2xl font-black text-gray-900">{stats.total}</div>
          <div className="text-xs text-gray-500">תרגילים{currentLocationFilter !== 'all' ? ` (${LOCATION_LABELS[currentLocationFilter]})` : ''}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-2xl font-black text-purple-600">{stats.totalMethods}</div>
          <div className="text-xs text-gray-500">שיטות</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
          <div className="text-2xl font-black text-green-600">{stats.readyMethodCount}</div>
          <div className="text-xs text-gray-500">✅ מוכנים</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-amber-100">
          <div className="text-2xl font-black text-amber-600">{stats.inPostProduction}</div>
          <div className="text-xs text-gray-500">🎬 בפוסט</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-red-100">
          <div className="text-2xl font-black text-red-600">{stats.needsMedia}</div>
          <div className="text-xs text-gray-500">❌ חסרה מדיה</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-2xl font-black text-blue-600">{stats.filmedCount}</div>
          <div className="text-xs text-gray-500">צולמו</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-2xl font-black text-indigo-600">{stats.editedCount}</div>
          <div className="text-xs text-gray-500">נערכו</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-red-100">
          <div className="text-2xl font-black text-red-600">{stats.withCriticalGaps}</div>
          <div className="text-xs text-gray-500">פערים קריטיים</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חפש תרגיל..."
              className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Location Filter */}
          <select
            value={currentLocationFilter}
            onChange={(e) => setCurrentLocationFilter(e.target.value as ExecutionLocation | 'all')}
            className="px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
          >
            <option value="all">כל המיקומים</option>
            {CONTENT_LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>{LOCATION_LABELS[loc]}</option>
            ))}
          </select>

          {/* Production Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="ready">✅ מוכן</option>
            <option value="in_post_production">🎬 בפוסט-פרודקשן</option>
            <option value="needs_media">❌ חסרה מדיה</option>
          </select>

          {/* Workflow Filter */}
          <select
            value={workflowFilter}
            onChange={(e) => setWorkflowFilter(e.target.value as typeof workflowFilter)}
            className="px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
          >
            <option value="all">שלב עבודה</option>
            <option value="not_filmed">לא צולם</option>
            <option value="filmed_not_edited">צולם - לא נערך</option>
            <option value="edited_not_uploaded">נערך - לא הועלה</option>
          </select>

          {/* Gaps Toggle */}
          <button
            onClick={() => setShowGapsOnly(!showGapsOnly)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all
              ${showGapsOnly 
                ? 'bg-red-100 text-red-700 border-2 border-red-300' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }
            `}
          >
            <AlertTriangle size={16} />
            פערים בלבד
          </button>
        </div>

        {/* Selection Actions */}
        <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
          <button
            onClick={selectAllVisible}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
          >
            בחר הכל ({filteredRows.length})
          </button>
          {selectedRows.size > 0 && (
            <>
              <span className="text-sm text-gray-500">{selectedRows.size} נבחרו</span>
              <button
                onClick={clearSelection}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                נקה בחירה
              </button>
            </>
          )}
          <div className="flex-1" />
          <button
            onClick={handleExportTaskList}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md"
          >
            <Download size={18} />
            ייצא רשימת משימות
          </button>
        </div>
      </div>

      {/* Matrix Grid */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === filteredRows.length && filteredRows.length > 0}
                    onChange={(e) => e.target.checked ? selectAllVisible() : clearSelection()}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-right">שם התרגיל</th>
                <th className="px-4 py-3 text-center">רמה</th>
                <th className="px-4 py-3 text-center">תיאור</th>
                <th className="px-4 py-3 text-center">רמזים</th>
                {CONTENT_LOCATIONS.map((loc) => (
                  <th key={loc} className="px-3 py-3 text-center min-w-[120px]">
                    {LOCATION_LABELS[loc]}
                  </th>
                ))}
                <th className="px-4 py-3 text-center">פערים</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((row) => (
                <tr
                  key={row.exerciseId}
                  className={`
                    hover:bg-gray-50 transition-colors
                    ${selectedRows.has(row.exerciseId) ? 'bg-indigo-50' : ''}
                    ${row.gaps.length > 0 ? 'bg-red-50/30' : ''}
                  `}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(row.exerciseId)}
                      onChange={() => toggleRowSelection(row.exerciseId)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-900">{row.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{row.exerciseId.slice(0, 8)}...</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 bg-purple-100 text-purple-700 rounded-full font-bold text-sm">
                      {row.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={row.descriptionStatus} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={row.generalCuesStatus} />
                  </td>
                  {CONTENT_LOCATIONS.map((loc) => (
                    <td key={loc} className="px-2 py-2">
                      <LocationCell
                        location={loc}
                        methods={row.locations[loc]}
                        isRequired={row.requiredLocations.includes(loc)}
                        fieldRecordingMode={fieldRecordingMode}
                        onAddMethod={() => {
                          window.open(`/admin/exercises/${row.exerciseId}/edit?addLocation=${loc}`, '_blank');
                        }}
                        onUpdateWorkflow={(methodIndex, step, completed) => {
                          handleWorkflowUpdate(row.exerciseId, methodIndex, step, completed);
                        }}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <GapBadge 
                      gapsDetailed={row.gapsDetailed} 
                      criticalCount={row.criticalGapCount}
                      workflowCount={row.workflowGapCount}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredRows.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <FileText size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">לא נמצאו תרגילים</p>
            <p className="text-sm">נסה לשנות את הפילטרים</p>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="text-center text-sm text-gray-500">
        מציג {filteredRows.length} מתוך {rows.length} תרגילים
      </div>
    </div>
  );
}
