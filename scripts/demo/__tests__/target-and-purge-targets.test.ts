import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { PURGE_CONFIRM_PHRASE, SEED_CONFIRM_PHRASE } from '../lib/config';
import { perUserCollections } from '../lib/purge-targets';
import { parseDemoArgs, requireConfirm, resolveDemoTarget } from '../lib/target';

describe('target: never a guessed project', () => {
  const key = JSON.stringify({ project_id: 'appout-1' });
  it('requires --project', () => {
    expect(() => resolveDemoTarget({ project: null, emulator: true }, {})).toThrow(/--project/);
    expect(() => resolveDemoTarget({ project: null, emulator: false }, { FIREBASE_SERVICE_ACCOUNT_KEY: key })).toThrow(/--project/);
  });
  it('--emulator only on a local host', () => {
    expect(resolveDemoTarget({ project: 'p', emulator: true }, {}).emulator).toBe('127.0.0.1:8080');
    expect(resolveDemoTarget({ project: 'p', emulator: true }, { FIRESTORE_EMULATOR_HOST: 'localhost:8089' }).emulator).toBe('localhost:8089');
    expect(() => resolveDemoTarget({ project: 'p', emulator: true }, { FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443' })).toThrow();
  });
  it('production: the service account must be for the same project; a stray emulator host is an error', () => {
    expect(resolveDemoTarget({ project: 'appout-1', emulator: false }, { FIREBASE_SERVICE_ACCOUNT_KEY: key }).emulator).toBeNull();
    expect(() => resolveDemoTarget({ project: 'other', emulator: false }, { FIREBASE_SERVICE_ACCOUNT_KEY: key })).toThrow(/appout-1/);
    expect(() => resolveDemoTarget({ project: 'appout-1', emulator: false }, {})).toThrow(/FIREBASE_SERVICE_ACCOUNT_KEY/);
    expect(() => resolveDemoTarget({ project: 'appout-1', emulator: false }, { FIREBASE_SERVICE_ACCOUNT_KEY: key, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).toThrow(/--emulator/);
  });
  it('confirmation phrases must match exactly', () => {
    const a = parseDemoArgs(['--project', 'p', '--confirm', SEED_CONFIRM_PHRASE, '--emulator', 'x@y.z']);
    expect(a.project).toBe('p');
    expect(a.emulator).toBe(true);
    expect(a.positional).toEqual(['x@y.z']);
    expect(() => requireConfirm(a, SEED_CONFIRM_PHRASE, 'seed')).not.toThrow();
    expect(() => requireConfirm(a, PURGE_CONFIRM_PHRASE, 'purge')).toThrow(PURGE_CONFIRM_PHRASE);
    expect(() => requireConfirm(parseDemoArgs([]), SEED_CONFIRM_PHRASE, 'seed')).toThrow();
    expect(PURGE_CONFIRM_PHRASE).toBe('מחק את עולם הדמו');
  });
});

describe('purge mirrors purgeUserData', () => {
  it('covers every collection purgeUserData (functions/src/onUserDelete.ts) touches', () => {
    const src = readFileSync(resolve(__dirname, '../../../functions/src/onUserDelete.ts'), 'utf8');
    const body = src.slice(src.indexOf('async function purgeUserData'), src.indexOf('async function writeDeletionAuditLog'));
    expect(body.length).toBeGreaterThan(1000);
    const named = new Set<string>();
    for (const m of Array.from(body.matchAll(/collection\('([^']+)'\)/g))) named.add(m[1]);
    for (const m of Array.from(body.matchAll(/for \(const top of \[([^\]]+)\]/g))) m[1].split(',').forEach((s: string) => named.add(s.trim().replace(/'/g, '')));
    expect(named.size).toBeGreaterThan(10);
    const covered = perUserCollections();
    const missing = Array.from(named).filter((c) => !covered.has(c));
    expect(missing).toEqual([]);
  });
});
