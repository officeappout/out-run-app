'use client';

<<<<<<< HEAD
import { useState, useEffect, useRef } from 'react';
=======
import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
>>>>>>> 166f532b436b3ab771a2f81e1f682c7e4e7de65b
import { ExecutionMethod, ExecutionLocation } from '../../../core/exercise.types';
import { GymEquipment } from '../../../../equipment/gym/core/gym-equipment.types';
import { GearDefinition } from '../../../../equipment/gear/core/gear-definition.types';
import { 
  Plus, Info, Zap, Target, MapPin, Users, Package, ArrowDown, Copy, 
  ChevronDown, ChevronRight, Home, Navigation, Building2, User, Plane, X,
  Video, VideoOff, ListChecks, AlertCircle, Image, ImageOff, Dumbbell, Trees,
  Save, CheckCircle2
} from 'lucide-react';
import ExecutionMethodCard from './ExecutionMethodCard';
import { useMethodsAutosave } from '../../hooks/useMethodsAutosave';

/**
 * Deep clone an object to prevent mutations
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone) as T;
  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

// Location labels for display with appropriate icons
const LOCATION_LABELS: Record<ExecutionLocation, { label: string; icon: React.ReactNode }> = {
  home: { label: 'בית', icon: <Home size={14} /> },
  park: { label: 'פארק', icon: <Trees size={14} /> },
  street: { label: 'רחוב', icon: <Navigation size={14} /> },
  office: { label: 'משרד', icon: <Building2 size={14} /> },
  school: { label: 'בית ספר', icon: <Building2 size={14} /> },
  gym: { label: 'חדר כושר', icon: <Dumbbell size={14} /> },
  airport: { label: 'שדה תעופה', icon: <Plane size={14} /> },
};

interface MethodsSectionProps {
  executionMethods: ExecutionMethod[];
  setExecutionMethods: React.Dispatch<React.SetStateAction<ExecutionMethod[]>>;
  gymEquipmentList: GymEquipment[];
  gearDefinitionsList: GearDefinition[];
  loadingRequirements: boolean;
  isFollowAlong?: boolean;
  focusedMethodIndex?: number | null;
  onMethodFocused?: () => void;
  exerciseId?: string | null; // For autosave
}

export interface MethodsSectionRef {
  clearDraft: () => void;
}

const MethodsSection = forwardRef<MethodsSectionRef, MethodsSectionProps>(({
  executionMethods,
  setExecutionMethods,
  gymEquipmentList,
  gearDefinitionsList,
  loadingRequirements,
  isFollowAlong = false,
  focusedMethodIndex = null,
  onMethodFocused,
  exerciseId = null,
}, ref) => {
  // Track which method was just duplicated (for visual feedback)
  const [justDuplicatedIndex, setJustDuplicatedIndex] = useState<number | null>(null);
  
  // Track expanded state for each method - store indices of expanded methods
  const [expandedMethods, setExpandedMethods] = useState<Set<number>>(new Set());
  
  // Track if info section is expanded (collapsed by default)
  const [infoExpanded, setInfoExpanded] = useState(false);

<<<<<<< HEAD
  // Undo-on-delete: buffer the last deleted method for 5 seconds
  const [deletedMethodBuffer, setDeletedMethodBuffer] =
    useState<{ method: ExecutionMethod; originalIndex: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
=======
  // Draft restoration state
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [draftToRestore, setDraftToRestore] = useState<ExecutionMethod[] | null>(null);

  // Silent autosave hook
  const { loadDraft, clearDraft, saveNow } = useMethodsAutosave(
    executionMethods,
    exerciseId,
    { debounceMs: 2000, enabled: !!exerciseId }
  );

  // Expose clearDraft to parent via ref
  useImperativeHandle(ref, () => ({
    clearDraft,
  }));
>>>>>>> 166f532b436b3ab771a2f81e1f682c7e4e7de65b

  /**
   * Get equipment/gear names for display in header
   */
  const getEquipmentNames = (method: ExecutionMethod): { name: string; type: 'fixed' | 'personal' | 'improvised' }[] => {
    const items: { name: string; type: 'fixed' | 'personal' | 'improvised' }[] = [];
    
    // Get fixed equipment names
    if (method.equipmentIds?.length) {
      method.equipmentIds.forEach(id => {
        const equipment = gymEquipmentList.find(eq => eq.id === id);
        if (equipment) {
          items.push({ name: equipment.name, type: 'fixed' });
        }
      });
    }
    
    // Get gear names
    if (method.gearIds?.length) {
      method.gearIds.forEach(id => {
        const gear = gearDefinitionsList.find(g => g.id === id);
        if (gear) {
          const name = gear.name?.he || gear.name?.en || id;
          // Check if it's user gear or improvised
          const isImprovised = gear.category === 'improvised';
          items.push({ name, type: isImprovised ? 'improvised' : 'personal' });
        } else {
          // Treat as improvised if not found in definitions
          items.push({ name: id, type: 'improvised' });
        }
      });
    }
    
    return items;
  };

  /**
   * Check method content status for indicators
   */
  const getMethodStatus = (method: ExecutionMethod) => {
    const hasVideo = !!(method.media?.mainVideoUrl);
    const hasImage = !!(method.media?.imageUrl);
    const hasCues = !!(method.specificCues && method.specificCues.length > 0);
    const hasHighlights = !!(method.highlights && method.highlights.length > 0);
    
    return { hasVideo, hasImage, hasCues, hasHighlights };
  };

  // Auto-expand focused method
  useEffect(() => {
    if (focusedMethodIndex !== null) {
      setExpandedMethods(prev => new Set(prev).add(focusedMethodIndex));
    }
  }, [focusedMethodIndex]);

  // Check for draft on mount
  useEffect(() => {
    if (!exerciseId) return;

    const draft = loadDraft();
    if (draft && draft.length > 0) {
      // Only show prompt if current methods are empty or significantly different
      const shouldPrompt = executionMethods.length === 0 || 
                          Math.abs(draft.length - executionMethods.length) > 0;
      
      if (shouldPrompt) {
        setDraftToRestore(draft);
        setShowDraftPrompt(true);
      }
    }
  }, [exerciseId]); // Only run on mount

  const handleRestoreDraft = () => {
    if (draftToRestore) {
      setExecutionMethods(draftToRestore);
      setShowDraftPrompt(false);
      setDraftToRestore(null);
      
      // Auto-expand all restored methods
      const indices = draftToRestore.map((_, idx) => idx);
      setExpandedMethods(new Set(indices));
    }
  };

  const handleDismissDraft = () => {
    clearDraft();
    setShowDraftPrompt(false);
    setDraftToRestore(null);
  };

  const toggleMethodExpanded = (index: number) => {
    setExpandedMethods(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const createNewMethod = (): ExecutionMethod => ({
    methodName: '',
    location: 'home',
    requiredGearType: 'user_gear',
    gearIds: [],
    equipmentIds: [],
    locationMapping: [],
    lifestyleTags: [],
    media: {},
  });

  const addNewMethod = () => {
    const newIndex = executionMethods.length;
    setExecutionMethods([...executionMethods, createNewMethod()]);
    // Auto-expand the new method
    setExpandedMethods(prev => new Set(prev).add(newIndex));
    // Scroll to new method after render
    setTimeout(() => {
      const element = document.getElementById(`execution-method-${newIndex}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const duplicateMethod = (index: number) => {
    const originalMethod = executionMethods[index];
    const clonedMethod = deepClone(originalMethod);
    const originalName = clonedMethod.methodName || `Method ${index + 1}`;
    clonedMethod.methodName = `${originalName} (עותק)`;
    
    const newMethods = [...executionMethods];
    newMethods.splice(index + 1, 0, clonedMethod);
    setExecutionMethods(newMethods);
    
    const newIndex = index + 1;
    setJustDuplicatedIndex(newIndex);
    
    // Auto-expand the duplicated method
    setExpandedMethods(prev => {
      const next = new Set(prev);
      // Shift indices for methods after the insertion point
      const newSet = new Set<number>();
      next.forEach(idx => {
        if (idx > index) {
          newSet.add(idx + 1);
        } else {
          newSet.add(idx);
        }
      });
      newSet.add(newIndex); // Expand the new one
      return newSet;
    });
    
    setTimeout(() => setJustDuplicatedIndex(null), 2000);
    setTimeout(() => {
      const element = document.getElementById(`execution-method-${newIndex}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const removeMethod = (index: number) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setDeletedMethodBuffer({ method: deepClone(executionMethods[index]), originalIndex: index });

    setExecutionMethods(executionMethods.filter((_, i) => i !== index));
    setExpandedMethods(prev => {
      const newSet = new Set<number>();
      prev.forEach(idx => {
        if (idx < index) {
          newSet.add(idx);
        } else if (idx > index) {
          newSet.add(idx - 1);
        }
      });
      return newSet;
    });

    undoTimerRef.current = setTimeout(() => setDeletedMethodBuffer(null), 5000);
  };

  const handleUndoDelete = () => {
    if (!deletedMethodBuffer) return;
    const { method, originalIndex } = deletedMethodBuffer;
    const restored = [...executionMethods];
    const insertAt = Math.min(originalIndex, restored.length);
    restored.splice(insertAt, 0, method);
    setExecutionMethods(restored);
    setExpandedMethods(prev => new Set(prev).add(insertAt));
    setDeletedMethodBuffer(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      {/* Draft Restore Prompt */}
      {showDraftPrompt && draftToRestore && (
        <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Save size={20} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-blue-900 mb-1">
                נמצאה טיוטה שמורה
              </h3>
              <p className="text-xs text-blue-700 mb-3">
                מצאנו {draftToRestore.length} שיטות ביצוע שנשמרו אוטומטית. האם לשחזר אותן?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRestoreDraft}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                >
                  <CheckCircle2 size={14} />
                  שחזר טיוטה
                </button>
                <button
                  type="button"
                  onClick={handleDismissDraft}
                  className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors"
                >
                  התעלם
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
          <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
          שיטות ביצוע (Execution Methods)
          {executionMethods.length > 0 && (
            <span className="text-sm font-normal text-gray-500">
              ({executionMethods.length})
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={addNewMethod}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg font-bold hover:bg-cyan-600 transition-colors"
        >
          <Plus size={18} />
          הוסף שיטת ביצוע
        </button>
      </div>

      <div className="space-y-3">
        {executionMethods.map((method, index) => {
          // Sanitize methodName
          const sanitizedMethod: ExecutionMethod = {
            ...method,
            methodName: (() => {
              const name = method.methodName;
              if (typeof name === 'string') return name;
              if (typeof name === 'object' && name !== null) {
                return (name as any).he || (name as any).en || '';
              }
              return '';
            })()
          };
          
          const isJustDuplicated = justDuplicatedIndex === index;
          const isExpanded = expandedMethods.has(index);
          const isFocused = focusedMethodIndex === index;
          // Use locationMapping (array of available locations) instead of deprecated location property
          const locationMappingArr = sanitizedMethod.locationMapping || [];
          // Get primary location for display (first in mapping, or fallback to legacy location property)
          const primaryLocation = locationMappingArr.length > 0 
            ? locationMappingArr[0] 
            : (sanitizedMethod.location || 'home');
          const locationLabel = LOCATION_LABELS[primaryLocation] || LOCATION_LABELS.home;
          const hasMultipleLocations = locationMappingArr.length > 1;
          const methodDisplayName = sanitizedMethod.methodName || `שיטת ביצוע ${index + 1}`;
          const equipmentNames = getEquipmentNames(sanitizedMethod);
          const status = getMethodStatus(sanitizedMethod);
          
          return (
            <div
              id={`execution-method-${index}`}
              key={index}
              className={`border rounded-xl overflow-hidden transition-all duration-300 ${
                isFocused 
                  ? 'ring-2 ring-cyan-500 border-cyan-300' 
                  : isJustDuplicated
                  ? 'ring-2 ring-green-500 border-green-300 bg-green-50/30'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Collapsible Header */}
              <div 
                className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                  isExpanded ? 'bg-gray-50 border-b border-gray-200' : 'bg-white hover:bg-gray-50'
                }`}
                onClick={() => toggleMethodExpanded(index)}
              >
                {/* Duplicate Button - Far Left (RTL: start of row) */}
                <div className="flex items-center ml-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => duplicateMethod(index)}
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="שכפל שיטת ביצוע"
                  >
                    <Copy size={16} />
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Expand/Collapse Icon */}
                  <div className={`transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>
                    <ChevronRight size={18} className="text-gray-400" />
                  </div>
                  
                  {/* Method Number Badge */}
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                    {index + 1}
                  </span>
                  
                  {/* Method Name */}
                  <span className="font-semibold text-gray-800 truncate max-w-[160px]">
                    {methodDisplayName}
                  </span>
                  
                  {/* Location Badge(s) - Dynamic based on method.locationMapping */}
                  {locationMappingArr.length > 0 ? (
                    <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                      {locationMappingArr.slice(0, 2).map((loc) => {
                        const locData = LOCATION_LABELS[loc] || LOCATION_LABELS.home;
                        return (
                          <span 
                            key={loc}
                            className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
                          >
                            {locData.icon}
                            {locData.label}
                          </span>
                        );
                      })}
                      {locationMappingArr.length > 2 && (
                        <span className="text-[10px] text-gray-500">
                          +{locationMappingArr.length - 2}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                      {locationLabel.icon}
                      {locationLabel.label}
                      <span className="text-[9px]">(לא הוגדר)</span>
                    </span>
                  )}
                  
                  {/* Equipment Tags - Show actual names instead of count */}
                  {equipmentNames.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {equipmentNames.slice(0, 3).map((item, idx) => (
                        <span 
                          key={idx}
                          className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[80px] ${
                            item.type === 'fixed' 
                              ? 'bg-purple-100 text-purple-700' 
                              : item.type === 'personal'
                              ? 'bg-cyan-100 text-cyan-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                          title={item.name}
                        >
                          {item.name}
                        </span>
                      ))}
                      {equipmentNames.length > 3 && (
                        <span className="text-[10px] text-gray-500">
                          +{equipmentNames.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* Just Duplicated Indicator */}
                  {isJustDuplicated && (
                    <span className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium animate-pulse">
                      <Copy size={12} />
                      שוכפל!
                    </span>
                  )}
                </div>
                
                {/* Status Indicators + Delete - Right side */}
                <div className="flex items-center gap-1 mr-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  {/* Video Status */}
                  <div 
                    className={`p-1 rounded ${status.hasVideo ? 'text-green-600' : 'text-gray-300'}`}
                    title={status.hasVideo ? 'יש וידאו' : 'חסר וידאו'}
                  >
                    {status.hasVideo ? <Video size={14} /> : <VideoOff size={14} />}
                  </div>
                  
                  {/* Image Status */}
                  <div 
                    className={`p-1 rounded ${status.hasImage ? 'text-green-600' : 'text-gray-300'}`}
                    title={status.hasImage ? 'יש תמונה' : 'חסרה תמונה'}
                  >
                    {status.hasImage ? <Image size={14} /> : <ImageOff size={14} />}
                  </div>
                  
                  {/* Content Status (Cues & Highlights) */}
                  <div 
                    className={`p-1 rounded ${(status.hasCues && status.hasHighlights) ? 'text-green-600' : 'text-gray-300'}`}
                    title={
                      !status.hasCues && !status.hasHighlights 
                        ? 'חסרים דגשים והנחיות' 
                        : !status.hasCues 
                        ? 'חסרות הנחיות (Cues)' 
                        : !status.hasHighlights 
                        ? 'חסרים דגשים (Highlights)' 
                        : 'תוכן מלא'
                    }
                  >
                    {(status.hasCues && status.hasHighlights) ? (
                      <ListChecks size={14} />
                    ) : (
                      <AlertCircle size={14} />
                    )}
                  </div>

                  {/* Delete - separated from Copy by the entire row */}
                  <div className="w-px h-4 bg-gray-200 mx-1" />
                  <button
                    type="button"
                    onClick={() => removeMethod(index)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="מחק שיטת ביצוע"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              
              {/* Collapsible Content */}
              <div className={`transition-all duration-300 overflow-hidden ${
                isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
              }`}>
                <div className="p-4">
              <ExecutionMethodCard
                method={sanitizedMethod}
                index={index}
                gymEquipmentList={gymEquipmentList}
                gearDefinitionsList={gearDefinitionsList}
                loadingRequirements={loadingRequirements}
                isFollowAlong={isFollowAlong}
                    isFocused={isFocused}
                onFocused={onMethodFocused}
                onUpdate={(updated) => {
                const sanitizedUpdate: ExecutionMethod = {
                  ...updated,
                  methodName: (() => {
                    const name = updated.methodName;
                    if (typeof name === 'string') return name;
                    if (typeof name === 'object' && name !== null) {
                            return (name as any).he || (name as any).en || '';
                    }
                    return '';
                  })()
                };
                const newMethods = [...executionMethods];
                newMethods[index] = sanitizedUpdate;
                setExecutionMethods(newMethods);
              }}
                    onRemove={() => removeMethod(index)}
                    onDuplicate={() => duplicateMethod(index)}
                    hideHeaderActions={true}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {executionMethods.length === 0 && (
          <div className="text-center py-10 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
            <p className="text-gray-400 mb-2">לא נוספו שיטות ביצוע</p>
            <p className="text-xs text-gray-500 mb-4">
              הוסף שיטות ביצוע שונות לפי מיקום וסוג הציוד הנדרש
            </p>
            <button
              type="button"
              onClick={() => {
                setExecutionMethods([createNewMethod()]);
                setExpandedMethods(new Set([0]));
              }}
              className="text-cyan-600 hover:text-cyan-700 font-bold text-sm"
            >
              הוסף את שיטת הביצוע הראשונה
            </button>
          </div>
        )}
      </div>

      {/* Collapsible Priority Engine Guide */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setInfoExpanded(!infoExpanded)}
          className="w-full flex items-center justify-between p-4 bg-cyan-50 border border-cyan-200 rounded-xl hover:bg-cyan-100 transition-colors"
        >
          <div className="flex items-center gap-2">
          <div className="p-2 bg-cyan-100 rounded-lg">
            <Zap size={20} className="text-cyan-700" />
          </div>
          <h3 className="text-base font-black text-cyan-900">
            🧠 לוגיקת תיעדוף והצגת תכנים (The Selection Engine)
          </h3>
        </div>
          <div className={`transition-transform duration-200 ${infoExpanded ? 'rotate-180' : ''}`}>
            <ChevronDown size={20} className="text-cyan-700" />
          </div>
        </button>
        
        <div className={`transition-all duration-300 overflow-hidden ${
          infoExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div className="p-5 bg-cyan-50 border-x border-b border-cyan-200 rounded-b-xl space-y-3">
          {/* Priority 1: Brand Match */}
          <div className="flex items-start gap-3 p-3 bg-white/60 rounded-lg border border-cyan-100">
            <div className="p-1.5 bg-cyan-100 rounded-lg mt-0.5">
              <Target size={16} className="text-cyan-700" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-cyan-900 mb-1">
                תיעדוף 1: התאמה למותג (Brand Match)
              </p>
              <p className="text-xs text-cyan-800 leading-relaxed">
                אם המשתמש נמצא במיקום עם מותג ספציפי (למשל: Saly), המערכת תציג קודם כל את הסרטון שצולם על המתקן שלהם.
              </p>
            </div>
          </div>

          {/* Priority 2: Location */}
          <div className="flex items-start gap-3 p-3 bg-white/60 rounded-lg border border-cyan-100">
            <div className="p-1.5 bg-cyan-100 rounded-lg mt-0.5">
              <MapPin size={16} className="text-cyan-700" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-cyan-900 mb-1">
                תיעדוף 2: דיוק מיקום (Location)
              </p>
              <p className="text-xs text-cyan-800 leading-relaxed">
                המערכת תבחר את השיטה שמתאימה למיקום הנוכחי של המשתמש (משרד, שדה תעופה, פארק וכו').
              </p>
            </div>
          </div>

          {/* Priority 3: Persona */}
          <div className="flex items-start gap-3 p-3 bg-white/60 rounded-lg border border-cyan-100">
            <div className="p-1.5 bg-cyan-100 rounded-lg mt-0.5">
              <Users size={16} className="text-cyan-700" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-cyan-900 mb-1">
                תיעדוף 3: פילטר פרסונה (Persona)
              </p>
              <p className="text-xs text-cyan-800 leading-relaxed">
                מתוך המיקומים המתאימים, המערכת תבחר את הסרטון שתויג עבור סגנון החיים של המשתמש (הורה, סטודנט, הייטקיסט).
              </p>
            </div>
          </div>

          {/* Priority 4: Gear Tier */}
          <div className="flex items-start gap-3 p-3 bg-white/60 rounded-lg border border-cyan-100">
            <div className="p-1.5 bg-cyan-100 rounded-lg mt-0.5">
              <Package size={16} className="text-cyan-700" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-cyan-900 mb-1">
                תיעדוף 4: סוג הציוד (Gear Tier)
              </p>
              <p className="text-xs text-cyan-800 leading-relaxed">
                סדר העדיפויות בבחירת הציוד הוא: <span className="font-bold">מתקן קבוע ← ציוד אישי ← ציוד מאולתר</span>.
              </p>
            </div>
          </div>

          {/* Fallback */}
          <div className="flex items-start gap-3 p-3 bg-white/60 rounded-lg border border-cyan-100">
            <div className="p-1.5 bg-cyan-100 rounded-lg mt-0.5">
              <ArrowDown size={16} className="text-cyan-700" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-cyan-900 mb-1">
                ברירת מחדל (Fallback)
              </p>
              <p className="text-xs text-cyan-800 leading-relaxed">
                אם אין התאמה לאף אחד מהתנאים, תוצג שיטת הביצוע הראשונה ברשימה (דירוג 1).
              </p>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-4 pt-4 border-t border-cyan-200 flex items-start gap-2">
          <Info size={16} className="text-cyan-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-cyan-800 leading-relaxed">
            <span className="font-bold">💡 טיפ:</span> התראת ה-Push תשתמש בטקסט שהזנת בשדה ה-Notification Text של השיטה שנבחרה.
          </p>
            </div>
          </div>
        </div>
      </div>

      {/* Undo-delete toast */}
      {deletedMethodBuffer && (
        <div className="sticky bottom-4 mt-4 flex items-center justify-between px-4 py-3 bg-gray-800 text-white rounded-xl text-sm shadow-lg animate-in slide-in-from-bottom-2 z-10">
          <span>שיטת הביצוע נמחקה</span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="font-bold text-cyan-400 hover:text-cyan-300 transition-colors mr-4"
          >
            ביטול מחיקה ↩
          </button>
        </div>
      )}
    </div>
  );
});

MethodsSection.displayName = 'MethodsSection';

export default MethodsSection;
