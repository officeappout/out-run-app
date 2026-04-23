/**
 * Bulk JSON import service for unit hierarchies.
 *
 * Accepts a JSON structure and recursively creates units
 * under tenants/{orgId}/units/ with correct unitPath and parentUnitId.
 *
 * Expected JSON:
 * {
 *   "units": [
 *     {
 *       "name": "גדוד 101",
 *       "type": "battalion",
 *       "subUnits": [
 *         { "name": "פלוגה א'", "type": "company" },
 *         { "name": "פלוגה ב'", "type": "company", "subUnits": [...] }
 *       ]
 *     }
 *   ]
 * }
 */

import { doc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface HierarchyImportResult {
  created: number;
  errors: string[];
}

interface ImportUnitNode {
  name: string;
  type?: string;
  subUnits?: ImportUnitNode[];
}

interface ImportPayload {
  units: ImportUnitNode[];
}

function generateUnitId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  const suffix = Math.random().toString(36).substring(2, 6);
  return slug ? `${slug}_${suffix}` : `unit_${suffix}`;
}

interface FlatUnit {
  id: string;
  name: string;
  parentUnitId: string | null;
  unitPath: string[];
  type?: string;
}

function flattenTree(
  nodes: ImportUnitNode[],
  parentId: string | null,
  parentPath: string[],
): FlatUnit[] {
  const result: FlatUnit[] = [];

  for (const node of nodes) {
    if (!node.name || typeof node.name !== 'string') continue;

    const trimmedName = node.name.trim();
    if (!trimmedName) continue;

    const id = generateUnitId(trimmedName);
    const unitPath = [...parentPath, trimmedName];

    result.push({
      id,
      name: trimmedName,
      parentUnitId: parentId,
      unitPath,
      type: node.type,
    });

    if (Array.isArray(node.subUnits) && node.subUnits.length > 0) {
      result.push(...flattenTree(node.subUnits, id, unitPath));
    }
  }

  return result;
}

export async function importHierarchyFromJSON(
  orgId: string,
  payload: ImportPayload,
): Promise<HierarchyImportResult> {
  if (!orgId) {
    return { created: 0, errors: ['Missing orgId'] };
  }
  if (!payload?.units || !Array.isArray(payload.units) || payload.units.length === 0) {
    return { created: 0, errors: ['JSON must contain a non-empty "units" array'] };
  }

  const flatUnits = flattenTree(payload.units, null, []);

  if (flatUnits.length === 0) {
    return { created: 0, errors: ['No valid units found in JSON'] };
  }

  if (flatUnits.length > 500) {
    return { created: 0, errors: [`Too many units (${flatUnits.length}). Max 500 per import.`] };
  }

  const errors: string[] = [];
  let created = 0;

  // Firestore batches limited to 500 writes
  const BATCH_SIZE = 490;
  for (let i = 0; i < flatUnits.length; i += BATCH_SIZE) {
    const chunk = flatUnits.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const unit of chunk) {
      try {
        const ref = doc(db, 'tenants', orgId, 'units', unit.id);
        const data: Record<string, any> = {
          name: unit.name,
          unitPath: unit.unitPath,
          memberCount: 0,
          createdAt: serverTimestamp(),
        };
        if (unit.parentUnitId) {
          data.parentUnitId = unit.parentUnitId;
        }
        if (unit.type) {
          data.unitType = unit.type;
        }
        batch.set(ref, data);
      } catch (err: any) {
        errors.push(`${unit.name}: ${err?.message || 'unknown error'}`);
      }
    }

    try {
      await batch.commit();
      created += chunk.length;
    } catch (err: any) {
      errors.push(`Batch commit failed: ${err?.message || 'unknown error'}`);
    }
  }

  return { created, errors };
}
