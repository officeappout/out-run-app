/** Together layer (enable_together_layer_v1) — public surface. */
export { TOGETHER_CONFIG } from './core/config';
export * from './core/types';
export { decidePublish, statusChanged } from './core/presence-throttle';
export { orderParticipants, progressOf, type OrderedParticipant } from './core/presence-order';
export { decideTogetherMode, explainDecision, type TogetherDecision, type TogetherMode } from './core/level-similarity';
export { countdownAt, planStartAt, estimateClockOffset } from './core/countdown';
export { addCheer, cheersReceived, diffTogetherEvents, type TogetherEvent } from './core/cheers';
export { usePresence } from './hooks/usePresence';
export { usePublishPresence } from './hooks/usePublishPresence';
export { useTogetherLayerV1 } from './hooks/useTogetherLayerV1';
export { createMemoryPresenceAdapter } from './services/memory-presence-adapter';
