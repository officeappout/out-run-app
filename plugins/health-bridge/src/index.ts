import { registerPlugin } from '@capacitor/core';

import type { HealthBridgePlugin } from './definitions';

const HealthBridge = registerPlugin<HealthBridgePlugin>('HealthBridge', {
  web: () => import('./web').then((m) => new m.HealthBridgeWeb()),
});

export * from './definitions';
export { HealthBridge };
