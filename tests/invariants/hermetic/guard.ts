/**
 * guard.ts — import FIRST in any hermetic tsx entry point.
 *
 * TS `paths` only redirect the '@/lib/firebase' specifier; a few files import the
 * real module relatively (src/lib/firestore.service.ts → './firebase'), which would
 * initialize the PRODUCTION Firebase app. This hooks Node's resolver so ANY
 * resolution of src/lib/firebase.ts lands on the stub, and blocks network: global
 * fetch throws. (Vitest needs none of this: vi.mock matches by resolved file.)
 */
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
import { join } from 'node:path';
const Module = require('node:module');
const STUB_FIREBASE = join(__dirname, 'firebase.stub.ts');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: unknown, ...rest: unknown[]) {
  const resolved: string = origResolve.call(this, request, parent, ...rest);
  return /[/\\]src[/\\]lib[/\\]firebase\.ts$/.test(resolved) ? STUB_FIREBASE : resolved;
};
// UI-side imports pulled in by the hybrid/map graph (mapbox-gl.css …) are no-ops here.
for (const ext of ['.css', '.scss', '.svg', '.png']) (Module as any)._extensions[ext] = () => {};
(globalThis as any).fetch = async (u: unknown) => { throw new Error(`network disabled (hermetic): ${String(u).slice(0, 80)}`); };
(globalThis as any).__HERMETIC_GUARD__ = true;
export {};
