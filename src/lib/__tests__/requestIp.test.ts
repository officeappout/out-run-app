import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { getRequestIp } from '../requestIp';

/**
 * 23.09.2026 code-review fix: x-forwarded-for is client-suppliable in
 * general (though Vercel itself overwrites it on this project's plan —
 * see requestIp.ts's header comment for the cited source and the caveat
 * about a future proxy-in-front-of-Vercel scenario). x-real-ip and
 * x-vercel-forwarded-for must take priority so a spoofed x-forwarded-for
 * can never change the IP dimension's key when either is present.
 */
function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('https://example.com/api/whatever', { headers });
}

describe('getRequestIp', () => {
  it('a spoofed x-forwarded-for does not change the selected IP when x-real-ip is present', () => {
    const ip = getRequestIp(
      makeRequest({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }),
    );
    expect(ip).toBe('203.0.113.9');
  });

  it('x-vercel-forwarded-for takes priority over both x-real-ip and x-forwarded-for', () => {
    const ip = getRequestIp(
      makeRequest({
        'x-vercel-forwarded-for': '198.51.100.4',
        'x-real-ip': '203.0.113.9',
        'x-forwarded-for': '6.6.6.6',
      }),
    );
    expect(ip).toBe('198.51.100.4');
  });

  it('falls back to the first hop of x-forwarded-for when neither Vercel-set header is present', () => {
    const ip = getRequestIp(makeRequest({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }));
    expect(ip).toBe('198.51.100.4');
  });

  it('returns "unknown" when no IP header is present at all', () => {
    const ip = getRequestIp(makeRequest({}));
    expect(ip).toBe('unknown');
  });
});
