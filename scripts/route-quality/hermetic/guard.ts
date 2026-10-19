/**
 * Import FIRST in the measurement runner. Like tests/invariants/hermetic/guard.ts
 * (any resolution of src/lib/firebase.ts lands on the stub, so nothing can
 * reach production Firestore) — but network stays ON: the runner calls the
 * real Mapbox Directions and Overpass APIs, which is the point of measuring.
 */
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
import { join } from 'node:path';
const Module = require('node:module');
const STUB_FIREBASE = join(__dirname, '../../../tests/invariants/hermetic/firebase.stub.ts');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: unknown, ...rest: unknown[]) {
  const resolved: string = origResolve.call(this, request, parent, ...rest);
  return /[/\\]src[/\\]lib[/\\]firebase\.ts$/.test(resolved) ? STUB_FIREBASE : resolved;
};
for (const ext of ['.css', '.scss', '.svg', '.png']) (Module as any)._extensions[ext] = () => {};
export {};
