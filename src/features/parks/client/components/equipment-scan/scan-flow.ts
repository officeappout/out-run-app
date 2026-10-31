/**
 * Camera scan, phase 1: which screen follows a capture (boards ScanEquip + ScanEdges). Pure.
 *
 *   confirm   "זה נכון?" with the top item; "לא" opens the alternatives + search
 *   choose    same screen, alternatives already open (the model was only fairly sure)
 *   edge      dark / people / not found, each with a retake and a way out
 *   error     the request failed (limit, network): retry or pick from the list
 */
import type { ScanVerdict } from '@/lib/ai/scan/scan-types';
import type { ScanApiError } from './scan-api';

export type ScanEdge = 'dark' | 'not_found';

export type ScanScreen =
  | { kind: 'confirm'; equipmentId: string; brandName?: string; alternatives: string[]; open: boolean }
  | { kind: 'edge'; edge: ScanEdge }
  | { kind: 'error'; error: ScanApiError };

/** Urban results (bench / stairs) have no drawer: in phase 1 they read as "not found". */
const isCatalogId = (id: string) => !id.startsWith('urban:');

export function screenFromVerdict(verdict: ScanVerdict | undefined): ScanScreen {
  if (!verdict || verdict.kind === 'retake') {
    const reason = verdict?.kind === 'retake' ? verdict.reason : 'no_equipment';
    if (reason === 'dark') return { kind: 'edge', edge: 'dark' };
    return { kind: 'edge', edge: 'not_found' };
  }
  const alternatives = verdict.alternatives.filter(isCatalogId);
  if (!isCatalogId(verdict.candidateId)) {
    const [first, ...rest] = alternatives;
    return first ? { kind: 'confirm', equipmentId: first, alternatives: rest, open: true } : { kind: 'edge', edge: 'not_found' };
  }
  return {
    kind: 'confirm',
    equipmentId: verdict.candidateId,
    ...(verdict.brandName ? { brandName: verdict.brandName } : {}),
    alternatives,
    open: verdict.kind === 'choose',
  };
}
