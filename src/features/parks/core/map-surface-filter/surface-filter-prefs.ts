/**
 * Per-device persistence of the surface filter (a UI preference — localStorage is
 * enough, axiom §19). Every storage access is try/catch'd; garbage → default.
 */
import type { SurfaceFilter } from '../utils/route-surface';
import { DEFAULT_SURFACE_FILTER, parseSurfaceFilter } from './surface-filter-logic';

export const SURFACE_FILTER_STORAGE_KEY = 'out.map.surfaceFilter.v1';

export function serializeSurfaceFilter(filter: SurfaceFilter): string {
  return JSON.stringify({ v: 1, surface: filter });
}

export function parsePersistedSurfaceFilter(raw: unknown): SurfaceFilter {
  if (typeof raw !== 'string' || !raw) return DEFAULT_SURFACE_FILTER;
  try {
    const obj = JSON.parse(raw) as { v?: unknown; surface?: unknown } | null;
    if (!obj || typeof obj !== 'object' || obj.v !== 1) return DEFAULT_SURFACE_FILTER;
    return parseSurfaceFilter(obj.surface);
  } catch {
    return DEFAULT_SURFACE_FILTER;
  }
}

export function loadSurfaceFilter(): SurfaceFilter {
  try {
    if (typeof window === 'undefined') return DEFAULT_SURFACE_FILTER;
    return parsePersistedSurfaceFilter(window.localStorage.getItem(SURFACE_FILTER_STORAGE_KEY));
  } catch {
    return DEFAULT_SURFACE_FILTER;
  }
}

export function saveSurfaceFilter(filter: SurfaceFilter): void {
  try {
    if (typeof window === 'undefined') return;
    if (filter === DEFAULT_SURFACE_FILTER) window.localStorage.removeItem(SURFACE_FILTER_STORAGE_KEY);
    else window.localStorage.setItem(SURFACE_FILTER_STORAGE_KEY, serializeSurfaceFilter(filter));
  } catch {
    /* private mode / blocked storage — the filter just won't persist */
  }
}
