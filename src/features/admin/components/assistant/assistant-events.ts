/**
 * assistant-events — folds one server stream event into the answer message. Pure (node-tested).
 */
import type { AdminAssistantEvent } from '@/lib/ai/admin-assistant/sse';
import type { AssistantMessage } from './useAdminAssistantStore';

export function applyAssistantEvent(m: AssistantMessage, ev: AdminAssistantEvent): Partial<AssistantMessage> {
  switch (ev.type) {
    case 'text':
      return { text: m.text + ev.delta };
    case 'tool':
      return ev.status === 'start'
        ? { running: [...(m.running ?? []), ev.name] }
        : { running: (m.running ?? []).filter((n, i, arr) => !(n === ev.name && i === arr.indexOf(ev.name))) };
    case 'link':
      return m.links.some((l) => l.href === ev.href) ? {} : { links: [...m.links, { href: ev.href, title: ev.title, pageId: ev.pageId }] };
    case 'quick':
      return { card: ev.card };
    case 'evidence':
      return { evidence: ev.items };
    case 'done':
      return { pending: false, running: [], costUsd: ev.costUsd, auditId: ev.auditId, unverified: ev.unverified };
    case 'error':
      return { pending: false, running: [], error: ev.message };
  }
}
