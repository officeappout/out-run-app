/**
 * Access Code Admin Service
 *
 * CRUD operations for managing access codes.
 * Access codes are linked to the tenant/unit hierarchy.
 */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface AccessCode {
  id: string;
  code: string;
  tenantId: string;
  unitId: string;
  unitPath: string[];
  tenantType: 'municipal' | 'educational' | 'military';
  onboardingPath: string;
  isActive: boolean;
  usageCount: number;
  maxUses: number;
  expiresAt: Date | null;
  createdAt: Date;
  createdBy: string;
  label?: string;
  /** UID of the user who last redeemed this code */
  lastUsedByUid?: string;
  /** Display name of the user who last redeemed this code */
  lastUsedByDisplayName?: string;
}

function generateCode(prefix?: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix ? `${prefix}-${code}` : code;
}

function toDate(ts: any): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts);
  return null;
}

function normalizeAccessCode(id: string, data: any): AccessCode {
  return {
    id,
    code: data.code ?? id,
    tenantId: data.tenantId ?? '',
    unitId: data.unitId ?? '',
    unitPath: Array.isArray(data.unitPath) ? data.unitPath : [],
    tenantType: data.tenantType ?? 'municipal',
    onboardingPath: data.onboardingPath ?? 'FULL_PROGRAM',
    isActive: data.isActive ?? true,
    usageCount: data.usageCount ?? 0,
    maxUses: data.maxUses ?? 0,
    expiresAt: toDate(data.expiresAt),
    createdAt: toDate(data.createdAt) ?? new Date(),
    createdBy: data.createdBy ?? '',
    label: data.label ?? undefined,
    lastUsedByUid: data.lastUsedByUid ?? undefined,
    lastUsedByDisplayName: data.lastUsedByDisplayName ?? undefined,
  };
}

export async function getAllAccessCodes(): Promise<AccessCode[]> {
  const snap = await getDocs(collection(db, 'access_codes'));
  return snap.docs.map(d => normalizeAccessCode(d.id, d.data()));
}

export async function getAccessCodesByTenant(tenantId: string): Promise<AccessCode[]> {
  const snap = await getDocs(query(
    collection(db, 'access_codes'),
    where('tenantId', '==', tenantId),
  ));
  return snap.docs.map(d => normalizeAccessCode(d.id, d.data()));
}

export interface CreateAccessCodeInput {
  tenantId: string;
  unitId: string;
  unitPath: string[];
  tenantType: 'municipal' | 'educational' | 'military';
  maxUses: number;
  expiresInDays: number;
  label?: string;
  adminUid: string;
}

const MILITARY_KEYWORDS = ['גדוד', 'פלוגה', 'חטיבה', 'מחלקה', 'בסיס', 'טירונות', 'חיל'];

function detectMismatch(input: CreateAccessCodeInput): void {
  if (input.tenantType === 'municipal') {
    const name = [input.unitId, input.label ?? '', ...input.unitPath].join(' ');
    if (MILITARY_KEYWORDS.some(kw => name.includes(kw))) {
      console.warn('[AccessCode] WARNING: Unit name contains military keywords but tenantType is "municipal". Codes will get MUN- prefix. unitId:', input.unitId, 'tenantType:', input.tenantType, 'label:', input.label);
    }
  }
}

export async function createAccessCode(input: CreateAccessCodeInput): Promise<AccessCode> {
  detectMismatch(input);

  const onboardingPathMap: Record<string, string> = {
    military: 'MILITARY_JOIN',
    educational: 'SCHOOL_JOIN',
    municipal: 'FULL_PROGRAM',
  };

  const prefix = input.tenantType === 'military' ? 'MIL'
    : input.tenantType === 'educational' ? 'EDU'
    : 'MUN';

  const code = generateCode(prefix);
  const docId = code;

  const expiresAt = input.expiresInDays > 0
    ? new Date(Date.now() + input.expiresInDays * 86400000)
    : null;

  const data = {
    code,
    tenantId: input.tenantId,
    unitId: input.unitId,
    unitPath: input.unitPath,
    tenantType: input.tenantType,
    onboardingPath: onboardingPathMap[input.tenantType] ?? 'FULL_PROGRAM',
    isActive: true,
    usageCount: 0,
    maxUses: input.maxUses,
    expiresAt,
    createdAt: serverTimestamp(),
    createdBy: input.adminUid,
    label: input.label || null,
  };

  await setDoc(doc(db, 'access_codes', docId), data);

  return normalizeAccessCode(docId, { ...data, createdAt: new Date() });
}

export async function toggleAccessCode(codeId: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(db, 'access_codes', codeId), { isActive });
}

export async function deleteAccessCode(codeId: string): Promise<void> {
  await deleteDoc(doc(db, 'access_codes', codeId));
}

/**
 * Generate a batch of unique, single-use access codes for a unit.
 */
export async function createBatchAccessCodes(
  input: CreateAccessCodeInput,
  count: number,
): Promise<AccessCode[]> {
  detectMismatch(input);

  const onboardingPathMap: Record<string, string> = {
    military: 'MILITARY_JOIN',
    educational: 'SCHOOL_JOIN',
    municipal: 'FULL_PROGRAM',
  };

  const prefix = input.tenantType === 'military' ? 'MIL'
    : input.tenantType === 'educational' ? 'EDU'
    : 'MUN';

  const expiresAt = input.expiresInDays > 0
    ? new Date(Date.now() + input.expiresInDays * 86400000)
    : null;

  const results: AccessCode[] = [];
  const usedCodes = new Set<string>();

  for (let i = 0; i < count; i++) {
    let code: string;
    do {
      code = generateCode(prefix);
    } while (usedCodes.has(code));
    usedCodes.add(code);

    const data = {
      code,
      tenantId: input.tenantId,
      unitId: input.unitId,
      unitPath: input.unitPath,
      tenantType: input.tenantType,
      onboardingPath: onboardingPathMap[input.tenantType] ?? 'FULL_PROGRAM',
      isActive: true,
      usageCount: 0,
      maxUses: 1,
      expiresAt,
      createdAt: serverTimestamp(),
      createdBy: input.adminUid,
      label: input.label || null,
    };

    await setDoc(doc(db, 'access_codes', code), data);
    results.push(normalizeAccessCode(code, { ...data, createdAt: new Date() }));
  }

  return results;
}
