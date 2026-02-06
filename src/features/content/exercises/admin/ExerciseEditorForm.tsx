'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ExerciseFormData,
  AppLanguage,
  ExecutionMethod,
  TargetProgramRef,
} from '../core/exercise.types';
import { Program } from '../../programs/core/program.types';
import { getAllGymEquipment } from '../../equipment/gym/core/gym-equipment.service';
import { getAllGearDefinitions } from '../../equipment/gear/core/gear-definition.service';
import { GymEquipment } from '../../equipment/gym/core/gym-equipment.types';
import { GearDefinition } from '../../equipment/gear/core/gear-definition.types';
import { BasicsSection, MethodsSection, ContentSection, GeneralMetricsSection, TechnicalClassificationSection, MuscleSelectionSection, ExecutionDetailsSection, MobilePreview, CollapsibleSection } from './components/exercise-editor';
import DraftStatusIndicator from './components/exercise-editor/DraftStatusIndicator';
import { useAutoSaveDraft } from './hooks/useAutoSaveDraft';
import { discardExerciseDraft } from '../core/exercise.service';
import { safeRenderText } from '@/utils/render-helpers';
import { Check, Dumbbell, Settings2, Send, Cloud } from 'lucide-react';
import { 
  MUSCLE_GROUP_LABELS, 
  NOISE_LEVEL_LABELS, 
  SWEAT_LEVEL_LABELS, 
  MECHANICAL_TYPE_LABELS,
  MuscleGroup
} from '../core/exercise.types';

interface ExerciseEditorFormProps {
  programs: Program[];
  onSubmit: (data: ExerciseFormData) => void;
  isSubmitting: boolean;
  initialData?: ExerciseFormData;
  exerciseId?: string; // Required for auto-save (null for new exercises)
  contextLocation?: string; // Location from query params (for deep-linking from Content Status)
  contextPersona?: string; // Persona from query params (for deep-linking from Content Status)
  onFormDataChange?: (data: ExerciseFormData) => void; // Callback to update preview
}

// ============================================================================
// DEEP CLONE UTILITY - Prevent data loss during editing
// Must be outside component to be available during initial state setup
// ============================================================================

/**
 * Deep clone an object to ensure all nested properties are preserved
 */
function deepClone<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as T;
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as T;
  }
  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Sanitize and DEEP CLONE execution methods
 * This preserves workflow, needsLongExplanation, explanationStatus, and all nested fields
 */
function sanitizeAndCloneExecutionMethods(methods: any[] | undefined): ExecutionMethod[] {
  if (!Array.isArray(methods)) return [];
  return methods.map((method) => {
    // DEEP CLONE to preserve all nested objects
    const sanitized = deepClone(method);
    
    // Ensure methodName is always a string
    if (typeof sanitized.methodName === 'object' && sanitized.methodName !== null) {
      sanitized.methodName = sanitized.methodName.he || sanitized.methodName.en || '';
    } else if (typeof sanitized.methodName !== 'string') {
      sanitized.methodName = String(sanitized.methodName || '');
    }
    
    // Ensure workflow object is preserved with defaults
    if (!sanitized.workflow) {
      sanitized.workflow = {
        filmed: false,
        filmedAt: null,
        audio: false,
        audioAt: null,
        edited: false,
        editedAt: null,
        uploaded: false,
        uploadedAt: null,
      };
    }
    
    // Ensure needsLongExplanation defaults to false if not set
    if (sanitized.needsLongExplanation === undefined) {
      sanitized.needsLongExplanation = false;
    }
    
    // Ensure media object is preserved
    if (!sanitized.media) {
      sanitized.media = {
        mainVideoUrl: null,
        imageUrl: null,
        videoDurationSeconds: null,
      };
    }
    
    return sanitized as ExecutionMethod;
  });
}

export default function ExerciseEditorForm({
  programs,
  onSubmit,
  isSubmitting,
  initialData,
  exerciseId,
  contextLocation,
  contextPersona,
  onFormDataChange,
}: ExerciseEditorFormProps) {
  const [activeLang, setActiveLang] = useState<AppLanguage>('he');
  const [isDiscardingDraft, setIsDiscardingDraft] = useState(false);
  
  // Track if this is the initial mount to prevent calling parent callback during first render
  const isInitialMount = useRef(true);
  
  // =========================================================================
  // COMPLETE METADATA FIELD LIST - All fields that must be preserved
  // =========================================================================
  const [formData, setFormDataInternal] = useState<ExerciseFormData>({
    // === BASIC FIELDS ===
    name: initialData?.name || { he: '', en: '', es: '' },
    type: initialData?.type || 'reps',
    loggingMode: initialData?.loggingMode || 'reps',
    equipment: initialData?.equipment ? [...initialData.equipment] : [],
    programIds: initialData?.programIds ? [...initialData.programIds] : [],
    media: initialData?.media ? deepClone(initialData.media) : {},
    
    // === MUSCLE FIELDS ===
    muscleGroups: initialData?.muscleGroups ? [...initialData.muscleGroups] : [],
    primaryMuscle: initialData?.primaryMuscle,
    secondaryMuscles: initialData?.secondaryMuscles ? [...initialData.secondaryMuscles] : [],
    
    // === CONTENT ===
    content: {
      description: initialData?.content?.description || { he: '', en: '', es: '' },
      instructions: initialData?.content?.instructions || { he: '', en: '', es: '' },
      specificCues: initialData?.content?.specificCues ? [...initialData.content.specificCues] : [],
      goal: initialData?.content?.goal,
      notes: initialData?.content?.notes ? [...initialData.content.notes] : undefined,
      highlights: initialData?.content?.highlights ? [...initialData.content.highlights] : undefined,
    },
    
    // === EQUIPMENT REQUIREMENTS ===
    requiredGymEquipment: initialData?.requiredGymEquipment,
    requiredUserGear: initialData?.requiredUserGear ? [...initialData.requiredUserGear] : [],
    
    // === MOVEMENT CLASSIFICATION ===
    base_movement_id: initialData?.base_movement_id,
    movementGroup: initialData?.movementGroup, // קבוצת תנועה (squat, hinge, push, pull, etc.)
    movementType: initialData?.movementType ?? 'compound', // מורכב/מבודד - default to compound (תרגיל מורכב)
    symmetry: initialData?.symmetry ?? 'bilateral', // סימטריה - default to bilateral (דו צדדי)
    
    // === EXECUTION METHODS (deep cloned) ===
    execution_methods: initialData?.execution_methods ? deepClone(initialData.execution_methods) : undefined,
    targetPrograms: initialData?.targetPrograms ? deepClone(initialData.targetPrograms) : undefined,
    
    // === TAGS & ROLE ===
    tags: initialData?.tags ? [...initialData.tags] : [],
    exerciseRole: initialData?.exerciseRole, // warmup/cooldown/main
    isFollowAlong: initialData?.isFollowAlong,
    
    // === TIMING ===
    secondsPerRep: initialData?.secondsPerRep,
    defaultRestSeconds: initialData?.defaultRestSeconds,
    
    // === GENERAL METRICS (Effort/Indicators) ===
    noiseLevel: initialData?.noiseLevel, // רעש (1-3)
    sweatLevel: initialData?.sweatLevel, // מאמץ/הזעה (1-3)
    
    // === SAFETY / SENSITIVITY ZONES ===
    injuryShield: initialData?.injuryShield ? [...initialData.injuryShield] : [], // אזורים רגישים
    
    // === TECHNICAL CLASSIFICATION ===
    mechanicalType: initialData?.mechanicalType, // יד כפופה/ישרה (straight_arm/bent_arm/hybrid)
    fieldReady: initialData?.fieldReady, // מוכנות שדה
    
    // === PRODUCTION REQUIREMENTS ===
    requiredLocations: initialData?.requiredLocations ? [...initialData.requiredLocations] : [],
  });

  // CRITICAL: Sanitize highlights on initial load
  const sanitizeInitialHighlights = (highlights: any): string[] => {
    if (!Array.isArray(highlights)) return [];
    return highlights.map((h) => {
      if (typeof h === 'string') return h;
      if (typeof h === 'object' && h !== null) {
        return h.he || h.en || String(h);
      }
      return String(h || '');
    });
  };

  const [highlights, setHighlights] = useState<string[]>(
    sanitizeInitialHighlights(initialData?.content?.highlights)
  );
  const [gymEquipmentList, setGymEquipmentList] = useState<GymEquipment[]>([]);
  const [gearDefinitionsList, setGearDefinitionsList] = useState<GearDefinition[]>([]);
  const [loadingRequirements, setLoadingRequirements] = useState(true);

  const [executionMethods, setExecutionMethods] = useState<ExecutionMethod[]>(
    sanitizeAndCloneExecutionMethods(initialData?.execution_methods)
  );
  const [targetPrograms, setTargetPrograms] = useState<TargetProgramRef[]>(
    initialData?.targetPrograms || []
  );
  const [baseMovementQuery, setBaseMovementQuery] = useState<string>('');

  // =========================================================================
  // AUTO-SAVE DRAFT HOOK
  // =========================================================================
  const { state: draftState, hasDraft, setHasDraft, loadDraft } = useAutoSaveDraft(
    formData,
    {
      exerciseId: exerciseId || null,
      debounceMs: 2000,
      enabled: !!exerciseId, // Only enable for existing exercises
    }
  );

  // Handle discard draft
  const handleDiscardDraft = async () => {
    if (!exerciseId) return;
    
    setIsDiscardingDraft(true);
    try {
      await discardExerciseDraft(exerciseId);
      setHasDraft(false);
      // Reload the page to reset to live data
      window.location.reload();
    } catch (error) {
      console.error('Error discarding draft:', error);
      alert('שגיאה בביטול הטיוטה');
    } finally {
      setIsDiscardingDraft(false);
    }
  };

  // Load draft data on mount if it exists
  useEffect(() => {
    const checkAndLoadDraft = async () => {
      if (!exerciseId) return;
      
      const draft = await loadDraft();
      if (draft && draft.data) {
        // Ask user if they want to continue with draft
        const useDraft = window.confirm(
          `נמצאה טיוטה שנשמרה ב-${draft.savedAt.toLocaleString('he-IL')}.\nהאם לטעון את הטיוטה? (לחיצה על "ביטול" תטען את הנתונים המפורסמים)`
        );
        
        if (useDraft) {
          // Update form data with draft
          setFormDataInternal(draft.data);
          if (draft.data.content?.highlights) {
            setHighlights(sanitizeInitialHighlights(draft.data.content.highlights));
          }
          if (draft.data.execution_methods) {
            setExecutionMethods(sanitizeAndCloneExecutionMethods(draft.data.execution_methods));
          }
          if (draft.data.targetPrograms) {
            setTargetPrograms(draft.data.targetPrograms);
          }
        }
      }
    };
    
    checkAndLoadDraft();
  }, [exerciseId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showBaseMovementSuggestions, setShowBaseMovementSuggestions] = useState(false);
  const [focusedMethodIndex, setFocusedMethodIndex] = useState<number | null>(null);

  // =========================================================================
  // FORM DATA WRAPPER - Prevents React lifecycle warning
  // =========================================================================
  
  // Wrapper to update form data - uses setFormDataInternal directly
  const setFormData = (newData: ExerciseFormData | ((prev: ExerciseFormData) => ExerciseFormData)) => {
    setFormDataInternal(newData);
  };
  
  // Notify parent of form data changes AFTER state update (via useEffect)
  // This prevents the "Cannot update a component while rendering a different component" warning
  useEffect(() => {
    // Skip the initial mount to avoid calling parent during first render
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    // Call parent callback if provided
    if (onFormDataChange) {
      onFormDataChange(formData);
    }
  }, [formData, onFormDataChange]);

  // Handle context from Content Status Matrix (deep-link)
  useEffect(() => {
    if (contextLocation && executionMethods.length > 0) {
      // Find existing method matching the location
      const matchingIndex = executionMethods.findIndex((method) => {
        const matchesLocation = 
          method.locationMapping?.includes(contextLocation as any) || 
          method.location === contextLocation;
        const matchesPersona = contextPersona 
          ? method.lifestyleTags?.includes(contextPersona)
          : true;
        return matchesLocation && matchesPersona;
      });

      if (matchingIndex >= 0) {
        // Found matching method - focus it
        setFocusedMethodIndex(matchingIndex);
        // Scroll to the method after a short delay
        setTimeout(() => {
          const element = document.getElementById(`execution-method-${matchingIndex}`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      } else if (contextLocation) {
        // No matching method - create one with the context
        const newMethod: ExecutionMethod = {
          methodName: '',
          location: contextLocation as any,
          requiredGearType: 'user_gear',
          gearId: '',
          equipmentId: '',
          locationMapping: [contextLocation as any],
          lifestyleTags: contextPersona ? [contextPersona] : [],
          media: {},
        };
        const newMethods = [...executionMethods, newMethod];
        setExecutionMethods(newMethods);
        setFocusedMethodIndex(newMethods.length - 1);
        // Scroll to the new method
        setTimeout(() => {
          const element = document.getElementById(`execution-method-${newMethods.length - 1}`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }, [contextLocation, contextPersona, executionMethods.length]);


  // CRITICAL: Sanitize highlights array
  const sanitizeHighlightsArray = (highlights: any): string[] => {
    if (!Array.isArray(highlights)) return [];
    return highlights.map((h) => {
      if (typeof h === 'string') return h;
      if (typeof h === 'object' && h !== null) {
        return h.he || h.en || String(h);
      }
      return String(h || '');
    });
  };

  useEffect(() => {
    if (initialData) {
      console.log('[ExerciseEditorForm] Loading initial data with ALL metadata fields:', {
        primaryMuscle: initialData.primaryMuscle,
        secondaryMuscles: initialData.secondaryMuscles,
        movementGroup: initialData.movementGroup,
        movementType: initialData.movementType,
        symmetry: initialData.symmetry,
        mechanicalType: initialData.mechanicalType,
        noiseLevel: initialData.noiseLevel,
        sweatLevel: initialData.sweatLevel,
        injuryShield: initialData.injuryShield,
        tags: initialData.tags,
        exerciseRole: initialData.exerciseRole,
        requiredLocations: initialData.requiredLocations,
      });
      
      // CRITICAL: Sanitize and deep clone execution_methods before setting state
      const sanitizedExecutionMethods = sanitizeAndCloneExecutionMethods(initialData.execution_methods);
      const sanitizedHighlights = sanitizeHighlightsArray(initialData.content?.highlights);
      
      // COMPLETE UPDATE: Set ALL metadata fields from initialData
      setFormData({
        ...formData,
        ...deepClone(initialData), // Deep clone entire initialData to preserve all nested fields
        
        // === BASIC FIELDS ===
        name: initialData.name || formData.name,
        type: initialData.type || formData.type,
        loggingMode: initialData.loggingMode || formData.loggingMode,
        equipment: initialData.equipment ? [...initialData.equipment] : [],
        programIds: initialData.programIds ? [...initialData.programIds] : [],
        
        // === MUSCLE FIELDS ===
        muscleGroups: initialData.muscleGroups ? [...initialData.muscleGroups] : [],
        primaryMuscle: initialData.primaryMuscle,
        secondaryMuscles: initialData.secondaryMuscles ? [...initialData.secondaryMuscles] : [],
        
        // === CONTENT ===
        content: {
          description: initialData.content?.description || formData.content.description,
          instructions: initialData.content?.instructions || formData.content.instructions,
          specificCues: initialData.content?.specificCues ? [...initialData.content.specificCues] : [],
          goal: initialData.content?.goal ?? formData.content.goal,
          notes: initialData.content?.notes ? [...initialData.content.notes] : undefined,
          highlights: sanitizedHighlights,
        },
        
        // === EQUIPMENT REQUIREMENTS ===
        requiredGymEquipment: initialData.requiredGymEquipment,
        requiredUserGear: initialData.requiredUserGear ? [...initialData.requiredUserGear] : [],
        
        // === MOVEMENT CLASSIFICATION ===
        base_movement_id: initialData.base_movement_id || undefined,
        movementGroup: initialData.movementGroup,
        movementType: initialData.movementType,
        symmetry: initialData.symmetry,
        
        // === EXECUTION METHODS ===
        execution_methods: sanitizedExecutionMethods.length > 0 ? sanitizedExecutionMethods : undefined,
        targetPrograms: initialData.targetPrograms ? deepClone(initialData.targetPrograms) : undefined,
        
        // === TAGS & ROLE ===
        tags: initialData.tags ? [...initialData.tags] : [],
        exerciseRole: initialData.exerciseRole,
        isFollowAlong: initialData.isFollowAlong,
        
        // === TIMING ===
        secondsPerRep: initialData.secondsPerRep,
        defaultRestSeconds: initialData.defaultRestSeconds,
        
        // === GENERAL METRICS ===
        noiseLevel: initialData.noiseLevel,
        sweatLevel: initialData.sweatLevel,
        
        // === SAFETY / SENSITIVITY ZONES ===
        injuryShield: initialData.injuryShield ? [...initialData.injuryShield] : [],
        
        // === TECHNICAL CLASSIFICATION ===
        mechanicalType: initialData.mechanicalType,
        fieldReady: initialData.fieldReady,
        
        // === PRODUCTION REQUIREMENTS ===
        requiredLocations: initialData.requiredLocations ? [...initialData.requiredLocations] : [],
      });
      setHighlights(sanitizedHighlights);
      setExecutionMethods(sanitizedExecutionMethods);
    }
  }, [initialData]);

  useEffect(() => {
    loadRequirements();
  }, []);

  const loadRequirements = async () => {
    try {
      setLoadingRequirements(true);
      const [equipment, gear] = await Promise.all([
        getAllGymEquipment(),
        getAllGearDefinitions(),
      ]);
      setGymEquipmentList(equipment);
      setGearDefinitionsList(gear);
    } catch (error) {
      console.error('Error loading requirements:', error);
    } finally {
      setLoadingRequirements(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Auto-sync imageUrl to top-level media for list view
    const firstImageUrl = 
      executionMethods?.[0]?.media?.imageUrl ||
      executionMethods?.[0]?.media?.mainVideoUrl ||
      formData.media?.imageUrl ||
      formData.media?.videoUrl;
    
    // CRITICAL: Deep clone and clean up execution methods
    // This preserves ALL nested fields (workflow, media, needsLongExplanation, etc.)
    const cleanedMethods = executionMethods.map((method) => {
      // Deep clone to preserve all nested objects
      const clonedMethod = deepClone(method);
      
      // Only filter empty cues and highlights (handle both string and GenderedText)
      clonedMethod.specificCues = (clonedMethod.specificCues || []).filter((c) => {
        if (typeof c === 'string') return c.trim();
        // GenderedText: check if either male or female has content
        return c?.male?.trim() || c?.female?.trim();
      });
      clonedMethod.highlights = (clonedMethod.highlights || []).filter((h) => {
        if (typeof h === 'string') return h.trim();
        // GenderedText: check if either male or female has content
        return h?.male?.trim() || h?.female?.trim();
      });
      
      // Ensure workflow is preserved (never deleted)
      if (!clonedMethod.workflow) {
        clonedMethod.workflow = {
          filmed: false,
          filmedAt: null,
          audio: false,
          audioAt: null,
          edited: false,
          editedAt: null,
          uploaded: false,
          uploadedAt: null,
        };
      }
      
      // Ensure media object is preserved
      if (!clonedMethod.media) {
        clonedMethod.media = {
          mainVideoUrl: null,
          imageUrl: null,
          videoDurationSeconds: null,
        };
      }
      
      return clonedMethod;
    });
    
    // =========================================================================
    // BUILD COMPLETE FORM DATA WITH ALL METADATA FIELDS
    // =========================================================================
    const syncedFormData = {
      // Spread ALL form data first to include any field we might have missed
      ...formData,
      
      // === BASIC FIELDS ===
      name: formData.name,
      type: formData.type,
      loggingMode: formData.loggingMode,
      equipment: formData.equipment,
      programIds: formData.programIds,
      
      // === MUSCLE FIELDS ===
      muscleGroups: formData.muscleGroups,
      primaryMuscle: formData.primaryMuscle,
      secondaryMuscles: formData.secondaryMuscles,
      
      // === CONTENT ===
      content: {
        ...formData.content,
        goal: formData.content.description?.he || formData.content.goal,
        highlights: highlights.filter((h) => h.trim()),
      },
      
      // === EQUIPMENT REQUIREMENTS ===
      requiredGymEquipment: formData.requiredGymEquipment,
      requiredUserGear: formData.requiredUserGear,
      
      // === MOVEMENT CLASSIFICATION ===
      base_movement_id: formData.base_movement_id,
      movementGroup: formData.movementGroup,
      movementType: formData.movementType,
      symmetry: formData.symmetry,
      
      // === EXECUTION METHODS ===
      execution_methods: cleanedMethods.length > 0 ? cleanedMethods : undefined,
      targetPrograms: targetPrograms.length > 0 ? targetPrograms : undefined,
      
      // === TAGS & ROLE ===
      tags: formData.tags,
      exerciseRole: formData.exerciseRole,
      isFollowAlong: formData.isFollowAlong,
      
      // === TIMING ===
      secondsPerRep: formData.secondsPerRep,
      defaultRestSeconds: formData.defaultRestSeconds,
      
      // === GENERAL METRICS (Effort/Indicators) ===
      noiseLevel: formData.noiseLevel,
      sweatLevel: formData.sweatLevel,
      
      // === SAFETY / SENSITIVITY ZONES ===
      injuryShield: formData.injuryShield,
      
      // === TECHNICAL CLASSIFICATION ===
      mechanicalType: formData.mechanicalType,
      fieldReady: formData.fieldReady,
      
      // === PRODUCTION REQUIREMENTS ===
      requiredLocations: formData.requiredLocations,
      
      // === MEDIA (synced) ===
      media: {
        ...formData.media,
        imageUrl: firstImageUrl || formData.media?.imageUrl,
      },
    };
    
    // =========================================================================
    // VERIFICATION LOGGING - Check for missing metadata
    // =========================================================================
    const metadataFields = {
      muscles: { primaryMuscle: syncedFormData.primaryMuscle, secondaryMuscles: syncedFormData.secondaryMuscles },
      effort: { noiseLevel: syncedFormData.noiseLevel, sweatLevel: syncedFormData.sweatLevel },
      technical: { mechanicalType: syncedFormData.mechanicalType, movementType: syncedFormData.movementType },
      movement: { movementGroup: syncedFormData.movementGroup, symmetry: syncedFormData.symmetry },
      safety: { injuryShield: syncedFormData.injuryShield },
      production: { requiredLocations: syncedFormData.requiredLocations },
    };
    
    console.log('[Save] Fields being persisted:', metadataFields);
    
    // Warn about potentially missing fields
    const warningFields: string[] = [];
    if (syncedFormData.secondaryMuscles === undefined) warningFields.push('secondaryMuscles');
    if (syncedFormData.injuryShield === undefined) warningFields.push('injuryShield');
    if (syncedFormData.tags === undefined) warningFields.push('tags');
    
    if (warningFields.length > 0) {
      console.warn('[Save] WARNING: Missing metadata fields during save:', warningFields);
    }
    
    // =========================================================================
    // DEBUG: Full data dump before calling onSubmit
    // =========================================================================
    console.log('='.repeat(80));
    console.log('[DEBUG] FINAL DATA BEFORE CALLING onSubmit:');
    console.log('='.repeat(80));
    console.log('[DEBUG] Classification Fields:', {
      movementType: syncedFormData.movementType,
      symmetry: syncedFormData.symmetry,
      mechanicalType: syncedFormData.mechanicalType,
      movementGroup: syncedFormData.movementGroup,
    });
    console.log('[DEBUG] Array Fields:', {
      secondaryMuscles: syncedFormData.secondaryMuscles,
      injuryShield: syncedFormData.injuryShield,
      tags: syncedFormData.tags,
      requiredLocations: syncedFormData.requiredLocations,
    });
    console.log('[DEBUG] Metrics Fields:', {
      noiseLevel: syncedFormData.noiseLevel,
      sweatLevel: syncedFormData.sweatLevel,
      primaryMuscle: syncedFormData.primaryMuscle,
    });
    console.log('[DEBUG] Full syncedFormData JSON:', JSON.stringify(syncedFormData, null, 2));
    console.log('='.repeat(80));
    
    onSubmit(syncedFormData);
  };

  // Keep legacy programIds in sync with selected targetPrograms (for backward compatibility)
  useEffect(() => {
    const linkedProgramIds = Array.from(
      new Set(targetPrograms.map((tp) => tp.programId).filter(Boolean))
    );
    setFormData((prev) => ({
      ...prev,
      programIds: linkedProgramIds,
    }));
  }, [targetPrograms]);

  const toggleArrayItem = <T,>(array: T[], item: T): T[] => {
    return array.includes(item) ? array.filter((i) => i !== item) : [...array, item];
  };

  const addArrayItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => [...prev, '']);
  };

  const removeArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const updateArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  return (
    <>
    <form id="exercise-form" onSubmit={handleSubmit} className="space-y-6 w-full">
      {/* ============================================== */}
      {/* TOP SECTION - General Data */}
      {/* ============================================== */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="h-px flex-1 bg-gray-200"></div>
          <span className="text-xs font-bold uppercase tracking-wider">נתונים כלליים (General Data)</span>
          <div className="h-px flex-1 bg-gray-200"></div>
        </div>

        {/* Basic Info Section - Name, Type, Role, Movement Pattern */}
      <BasicsSection
        formData={formData}
        setFormData={setFormData}
        activeLang={activeLang}
        setActiveLang={setActiveLang}
        programs={programs}
        baseMovementQuery={baseMovementQuery}
        setBaseMovementQuery={setBaseMovementQuery}
        showBaseMovementSuggestions={showBaseMovementSuggestions}
        setShowBaseMovementSuggestions={setShowBaseMovementSuggestions}
        toggleArrayItem={toggleArrayItem}
        executionMethods={executionMethods}
        gymEquipmentList={gymEquipmentList}
        gearDefinitionsList={gearDefinitionsList}
      />

        {/* Muscle Selection - Primary + Secondary (Collapsible) */}
        <CollapsibleSection
          title="שרירי מטרה (Target Muscles)"
          subtitle="בחר את השרירים העיקריים והמשניים"
          icon={Dumbbell}
          iconBgColor="bg-red-100"
          iconColor="text-red-600"
          defaultExpanded={false}
          badge={
            (formData.primaryMuscle || (formData.secondaryMuscles && formData.secondaryMuscles.length > 0)) ? (
              <div className="flex items-center gap-1 flex-wrap">
                {/* Primary Muscle - highlighted */}
                {formData.primaryMuscle && (
                  <span className="text-[10px] font-medium bg-red-500 text-white px-1.5 py-0.5 rounded">
                    {MUSCLE_GROUP_LABELS[formData.primaryMuscle as MuscleGroup]?.he || formData.primaryMuscle}
                  </span>
                )}
                {/* Secondary Muscles */}
                {formData.secondaryMuscles?.slice(0, 3).map((muscle, idx) => (
                  <span key={idx} className="text-[10px] font-medium bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                    {MUSCLE_GROUP_LABELS[muscle as MuscleGroup]?.he || muscle}
                  </span>
                ))}
                {(formData.secondaryMuscles?.length || 0) > 3 && (
                  <span className="text-[10px] text-gray-500">+{formData.secondaryMuscles!.length - 3}</span>
                )}
              </div>
            ) : undefined
          }
        >
          <MuscleSelectionSection
            formData={formData}
            setFormData={setFormData}
            noContainer
          />
        </CollapsibleSection>

        {/* General Metrics - Noise, Sweat, Injury Shield (Collapsible) */}
        <CollapsibleSection
          title="מאפיינים כלליים (General Metrics)"
          subtitle="רמת רעש, הזעה ואזורי רגישות"
          icon={Settings2}
          iconBgColor="bg-amber-100"
          iconColor="text-amber-600"
          defaultExpanded={false}
          badge={
            (formData.noiseLevel || formData.sweatLevel || (formData.injuryShield && formData.injuryShield.length > 0)) ? (
              <div className="flex items-center gap-1 flex-wrap">
                {formData.noiseLevel && (
                  <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    🔊 {NOISE_LEVEL_LABELS[formData.noiseLevel]?.he}
                  </span>
                )}
                {formData.sweatLevel && (
                  <span className="text-[10px] font-medium bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded">
                    💧 {SWEAT_LEVEL_LABELS[formData.sweatLevel]?.he}
                  </span>
                )}
                {formData.injuryShield && formData.injuryShield.length > 0 && (
                  <span className="text-[10px] font-medium bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                    🛡️ {formData.injuryShield.length}
                  </span>
                )}
              </div>
            ) : undefined
          }
        >
          <GeneralMetricsSection
            formData={formData}
            setFormData={setFormData}
            noContainer
          />
        </CollapsibleSection>

        {/* Technical Classification - Calisthenics Mechanical Type (Collapsible) */}
        <CollapsibleSection
          title="סיווג טכני (Technical Classification)"
          subtitle="BA/SA, מורכב/מבודד, סימטריה"
          icon={Settings2}
          iconBgColor="bg-purple-100"
          iconColor="text-purple-600"
          defaultExpanded={false}
          badge={
            (formData.mechanicalType || formData.movementType || formData.symmetry) ? (
              <div className="flex items-center gap-1 flex-wrap">
                {/* Mechanical Type (BA/SA) */}
                {formData.mechanicalType && formData.mechanicalType !== 'none' && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    formData.mechanicalType === 'straight_arm' 
                      ? 'bg-amber-100 text-amber-700' 
                      : formData.mechanicalType === 'bent_arm'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {MECHANICAL_TYPE_LABELS[formData.mechanicalType]?.abbr || formData.mechanicalType}
                  </span>
                )}
                {/* Movement Type (Compound/Isolation) */}
                {formData.movementType && (
                  <span className="text-[10px] font-medium bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded capitalize">
                    {formData.movementType === 'compound' ? 'מורכב' : formData.movementType === 'isolation' ? 'מבודד' : formData.movementType}
                  </span>
                )}
                {/* Symmetry */}
                {formData.symmetry && (
                  <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                    {formData.symmetry === 'bilateral' ? 'דו-צדדי' : formData.symmetry === 'unilateral' ? 'חד-צדדי' : formData.symmetry}
                  </span>
                )}
              </div>
            ) : undefined
          }
        >
          <TechnicalClassificationSection
            formData={formData}
            setFormData={setFormData}
            noContainer
          />
        </CollapsibleSection>
      </div>

      {/* ============================================== */}
      {/* BOTTOM SECTION - Execution Details */}
      {/* ============================================== */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="h-px flex-1 bg-gray-200"></div>
          <span className="text-xs font-bold uppercase tracking-wider">פרטי ביצוע (Execution Details)</span>
          <div className="h-px flex-1 bg-gray-200"></div>
        </div>

        {/* Execution Methods Section - Video/Media per location */}
      <MethodsSection
        executionMethods={executionMethods}
        setExecutionMethods={setExecutionMethods}
        gymEquipmentList={gymEquipmentList}
        gearDefinitionsList={gearDefinitionsList}
        loadingRequirements={loadingRequirements}
        isFollowAlong={formData.isFollowAlong || false}
        focusedMethodIndex={focusedMethodIndex}
        onMethodFocused={() => setFocusedMethodIndex(null)}
      />

        {/* Execution Details - Specific Cues + Collapsible Instructions */}
        <ExecutionDetailsSection
          formData={formData}
          setFormData={setFormData}
          activeLang={activeLang}
          setActiveLang={setActiveLang}
        />

        {/* Content - Highlights and Program Linking (Already has built-in collapse) */}
        <ContentSection
          formData={formData}
          setFormData={setFormData}
          activeLang={activeLang}
          setActiveLang={setActiveLang}
          programs={programs}
          highlights={highlights}
          setHighlights={setHighlights}
          targetPrograms={targetPrograms}
          setTargetPrograms={setTargetPrograms}
          toggleArrayItem={toggleArrayItem}
          addArrayItem={addArrayItem}
          removeArrayItem={removeArrayItem}
          updateArrayItem={updateArrayItem}
        />
      </div>

      {/* Spacer to prevent fixed bar from covering last input */}
      <div className="pb-32" />
    </form>

    {/* Fixed Save Bar (Bottom) */}
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white/90 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        {/* Draft Status Indicator */}
        {exerciseId && (
          <DraftStatusIndicator
            state={draftState}
            hasDraft={hasDraft}
            onDiscard={handleDiscardDraft}
            isPublishing={isSubmitting}
          />
        )}
        
        {/* Publish Button */}
        <button 
          type="submit" 
          form="exercise-form"
          disabled={isSubmitting || isDiscardingDraft}
          className={`flex-1 max-w-md h-14 ${
            hasDraft 
              ? 'bg-green-600 hover:bg-green-700' 
              : 'bg-cyan-600 hover:bg-cyan-700'
          } disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-lg font-bold rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2`}
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {isSubmitting ? (
            <>
              <Cloud size={20} className="animate-pulse" />
              מפרסם...
            </>
          ) : hasDraft ? (
            <>
              <Send size={20} />
              פרסם שינויים
            </>
          ) : (
            <>
              <Check size={20} />
              שמור שינויים
            </>
          )}
        </button>
      </div>
    </div>
  </>
  );
}
