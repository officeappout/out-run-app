'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllExercises } from '@/features/content/exercises';
import { Exercise, ExecutionLocation, ExecutionMethod } from '@/features/content/exercises';
import { FilterState, MatrixCell, ContentStats, GroupByOption } from '../components/types';
import {
  LOCATION_LABELS,
  MUSCLE_GROUP_LABELS,
  MOVEMENT_GROUP_LABELS,
} from '../components/constants';

export function useContentMatrix() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [outdoorBrands, setOutdoorBrands] = useState<OutdoorBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    lifestyleTags: [],
    locations: [],
    equipment: [],
    brands: [],
    difficulty: [],
    muscleGroups: [],
    movementPatterns: [],
    exerciseRoles: [],
    movementTypes: [],
    symmetries: [],
  });
  const [groupBy, setGroupBy] = useState<GroupByOption>('muscleGroup');

  useEffect(() => {
    loadExercises();
    loadBrands();
  }, []);

  const loadBrands = async () => {
    try {
      const brands = await getAllOutdoorBrands();
      setOutdoorBrands(brands);
    } catch (error) {
      console.error('Error loading outdoor brands:', error);
    }
  };

  const loadExercises = async () => {
    setLoading(true);
    try {
      const data = await getAllExercises();
      setExercises(data);
    } catch (error) {
      console.error('Error loading exercises:', error);
      alert('שגיאה בטעינת התרגילים');
    } finally {
      setLoading(false);
    }
  };

  // Get all unique locations from exercises
  const allLocations = useMemo(() => {
    const locationSet = new Set<ExecutionLocation>();
    exercises.forEach((exercise) => {
      const executionMethods = exercise.executionMethods || exercise.execution_methods;
      executionMethods?.forEach((method: ExecutionMethod) => {
        if (method.locationMapping) {
          method.locationMapping.forEach((loc: ExecutionLocation) => {
            if (loc) locationSet.add(loc);
          });
        } else if (method.location) {
          locationSet.add(method.location);
        }
      });
    });
    return Array.from(locationSet).sort();
  }, [exercises]);

  // Get all unique lifestyle tags
  const allLifestyleTags = useMemo(() => {
    const tagSet = new Set<string>();
    exercises.forEach((exercise) => {
      const executionMethods = exercise.executionMethods || exercise.execution_methods;
      executionMethods?.forEach((method: ExecutionMethod) => {
        method.lifestyleTags?.forEach((tag: string) => tagSet.add(tag));
      });
    });
    return Array.from(tagSet).sort();
  }, [exercises]);

  // Filter exercises based on filter state
  const filteredExercises = useMemo(() => {
    return exercises.filter((exercise) => {
      // Lifestyle tags filter
      if (filters.lifestyleTags.length > 0) {
        const exerciseTags = new Set<string>();
        const executionMethods = exercise.executionMethods || exercise.execution_methods;
        executionMethods?.forEach((method: ExecutionMethod) => {
          method.lifestyleTags?.forEach((tag: string) => exerciseTags.add(tag));
        });
        if (!filters.lifestyleTags.some((tag) => exerciseTags.has(tag))) {
          return false;
        }
      }

      // Location filter
      if (filters.locations.length > 0) {
        const exerciseLocations = new Set<ExecutionLocation>();
        const executionMethods = exercise.executionMethods || exercise.execution_methods;
        executionMethods?.forEach((method: ExecutionMethod) => {
          if (method.locationMapping) {
            method.locationMapping.forEach((loc: ExecutionLocation) => {
              if (loc) exerciseLocations.add(loc);
            });
          } else if (method.location) {
            exerciseLocations.add(method.location);
          }
        });
        if (!filters.locations.some((loc) => exerciseLocations.has(loc))) {
          return false;
        }
      }

      // Muscle groups filter
      if (filters.muscleGroups.length > 0) {
        if (!filters.muscleGroups.some((mg) => exercise.muscleGroups?.includes(mg))) {
          return false;
        }
      }

      // Movement patterns filter
      if (filters.movementPatterns.length > 0) {
        if (!exercise.movementGroup || !filters.movementPatterns.includes(exercise.movementGroup)) {
          return false;
        }
      }

      // Exercise role filter
      if (filters.exerciseRoles.length > 0) {
        if (!exercise.exerciseRole || !filters.exerciseRoles.includes(exercise.exerciseRole)) {
          return false;
        }
      }

      // Movement type filter
      if (filters.movementTypes.length > 0) {
        if (!exercise.movementType || !filters.movementTypes.includes(exercise.movementType)) {
          return false;
        }
      }

      // Symmetry filter
      if (filters.symmetries.length > 0) {
        if (!exercise.symmetry || !filters.symmetries.includes(exercise.symmetry)) {
          return false;
        }
      }

      // Brand filter
      if (filters.brands.length > 0) {
        const executionMethods = exercise.executionMethods || exercise.execution_methods;
        const hasMatchingBrand = executionMethods?.some((method: ExecutionMethod) => {
          return method.brandId && filters.brands.includes(method.brandId);
        });
        if (!hasMatchingBrand) {
          return false;
        }
      }

      return true;
    });
  }, [exercises, filters]);

  // Build matrix cells
  const matrixCells = useMemo(() => {
    const cells: MatrixCell[] = [];
    filteredExercises.forEach((exercise) => {
      allLocations.forEach((location) => {
        // Find execution method for this location
        const executionMethods = exercise.executionMethods || exercise.execution_methods;
        const method = executionMethods?.find(
          (m: ExecutionMethod) => m.locationMapping?.includes(location) || m.location === location
        );

        if (!method) return;

        const hasVideo = !!method.media?.mainVideoUrl;
        const hasDuration = !!method.media?.videoDurationSeconds;
        const hasNotificationText = !!method.notificationText && method.notificationText.trim().length > 0;
        const hasYouTubeTutorial = !!method.media?.instructionalVideos?.length;
        const youtubeTutorialLangs: ('he' | 'en')[] = [];
        if (method.media?.instructionalVideos) {
          method.media.instructionalVideos.forEach((video: { lang: string; url: string }) => {
            if (video.lang === 'he' || video.lang === 'en') {
              youtubeTutorialLangs.push(video.lang as 'he' | 'en');
            }
          });
        }

        // Status: complete if video, duration, and notification text exist
        let status: 'complete' | 'partial' | 'missing' = 'missing';
        if (hasVideo && hasDuration && hasNotificationText) {
          status = 'complete';
        } else if (hasVideo) {
          status = 'partial';
        }

        cells.push({
          exerciseId: exercise.id,
          location,
          hasVideo,
          hasDuration,
          hasNotificationText,
          hasYouTubeTutorial,
          youtubeTutorialLangs,
          lifestyleTags: method.lifestyleTags || [],
          status,
        });
      });
    });
    return cells;
  }, [filteredExercises, allLocations]);

  // Group exercises
  const groupedExercises = useMemo(() => {
    const groups: Record<string, Exercise[]> = {};
    filteredExercises.forEach((exercise) => {
      let key = 'ללא קבוצה';
      if (groupBy === 'muscleGroup' && exercise.muscleGroups?.length) {
        key = exercise.muscleGroups.map((mg) => MUSCLE_GROUP_LABELS[mg]).join(', ');
      } else if (groupBy === 'pattern' && exercise.movementGroup) {
        key = MOVEMENT_GROUP_LABELS[exercise.movementGroup];
      } else if (groupBy === 'location') {
        const locations = new Set<ExecutionLocation>();
        const executionMethods = exercise.executionMethods || exercise.execution_methods;
        executionMethods?.forEach((method: ExecutionMethod) => {
          if (method.locationMapping) {
            method.locationMapping.forEach((loc: ExecutionLocation) => {
              if (loc) locations.add(loc);
            });
          } else if (method.location) {
            locations.add(method.location);
          }
        });
        key = Array.from(locations).map((loc) => LOCATION_LABELS[loc]).join(', ') || 'ללא מיקום';
      } else if (groupBy === 'program' && exercise.targetPrograms?.length) {
        key = `תוכנית: ${exercise.targetPrograms.length} תוכניות`;
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(exercise);
    });
    return groups;
  }, [filteredExercises, groupBy]);

  // Calculate stats
  const stats = useMemo<ContentStats>(() => {
    const total = matrixCells.length;
    const complete = matrixCells.filter((c) => c.status === 'complete').length;
    const partial = matrixCells.filter((c) => c.status === 'partial').length;
    const missing = matrixCells.filter((c) => c.status === 'missing').length;
    const coverage = total > 0 ? Math.round((complete / total) * 100) : 0;
    const toShoot = missing + partial;

    return { total, complete, partial, missing, coverage, toShoot };
  }, [matrixCells]);

  // Toggle filter
  const toggleFilter = <K extends keyof FilterState>(
    category: K,
    value: FilterState[K] extends (infer U)[] ? U : never
  ) => {
    setFilters((prev) => {
      const current = prev[category] as any[];
      const index = current.indexOf(value);
      if (index > -1) {
        return {
          ...prev,
          [category]: [...current.slice(0, index), ...current.slice(index + 1)],
        };
      } else {
        return {
          ...prev,
          [category]: [...current, value],
        };
      }
    });
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      lifestyleTags: [],
      locations: [],
      equipment: [],
      brands: [],
      difficulty: [],
      muscleGroups: [],
      movementPatterns: [],
      exerciseRoles: [],
      movementTypes: [],
      symmetries: [],
    });
  };

  return {
    loading,
    exercises,
    allLocations,
    allLifestyleTags,
    allBrands: outdoorBrands,
    filteredExercises,
    matrixCells,
    groupedExercises,
    stats,
    filters,
    groupBy,
    setGroupBy,
    toggleFilter,
    clearFilters,
  };
}
