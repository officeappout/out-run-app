import { describe, it, expect, vi } from 'vitest';
import {
  HEALTH_PERMISSION_CHANGED_EVENT,
  notifyHealthPermissionChanged,
  subscribeHealthPermissionChanged,
} from '../permissionEvents';

function fakeDoc() {
  const t = new EventTarget();
  return Object.assign(t, { visibilityState: 'hidden' as DocumentVisibilityState });
}

describe('health permission change signal (pilot O12)', () => {
  it('a flag write reaches every subscriber, and stops after unsubscribe', () => {
    const target = new EventTarget();
    const doc = fakeDoc();
    const onChange = vi.fn();
    const off = subscribeHealthPermissionChanged(onChange, target, doc as never);
    notifyHealthPermissionChanged(target);
    expect(onChange).toHaveBeenCalledTimes(1);
    off();
    notifyHealthPermissionChanged(target);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('coming back to the foreground re-reads (grant made in the OS settings); hiding does not', () => {
    const target = new EventTarget();
    const doc = fakeDoc();
    const onChange = vi.fn();
    subscribeHealthPermissionChanged(onChange, target, doc as never);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(onChange).not.toHaveBeenCalled();
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('uses one event name and never throws without a window', () => {
    expect(HEALTH_PERMISSION_CHANGED_EVENT).toBe('outrun:health-permission-changed');
    expect(() => notifyHealthPermissionChanged(null)).not.toThrow();
    expect(() => subscribeHealthPermissionChanged(() => {}, null, null)()).not.toThrow();
  });
});
