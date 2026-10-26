import { describe, it, expect, afterEach, vi } from 'vitest';
import { ProtocolInjector } from '../ProtocolInjector';
import { LIVE_FLAGS_CACHE_KEY } from '@/lib/feature-flag-live';
import type { ProtocolHints } from '../pipeline.types';

type Selector = {
  _selectProtocol: (d: 1 | 2 | 3, c: unknown, h: ProtocolHints, single: boolean, log: string[]) => { singleDomainPyramidOverride: boolean; setType: string };
};

const hints = { forcePyramidOnSingleDomainIntense: true } as unknown as ProtocolHints;

function setFlag(on: boolean) {
  const store: Record<string, string> = { [LIVE_FLAGS_CACHE_KEY]: JSON.stringify({ pyramidInjectionOff: on }) };
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store[k] ?? null } });
}

describe('single-domain D3 pyramid override vs pyramid_injection_off', () => {
  afterEach(() => vi.unstubAllGlobals());
  vi.spyOn(console, 'log').mockImplementation(() => {});

  it('switch off (default): the override still forces a pyramid candidate', () => {
    setFlag(false);
    const r = (new ProtocolInjector() as unknown as Selector)._selectProtocol(3, { preferredProtocols: [], protocolProbability: 0 }, hints, true, []);
    expect(r.singleDomainPyramidOverride).toBe(true);
  });

  it('switch on: no override, no pyramid, straight sets when nothing else is configured', () => {
    setFlag(true);
    const r = (new ProtocolInjector() as unknown as Selector)._selectProtocol(3, { preferredProtocols: [], protocolProbability: 0 }, hints, true, []);
    expect(r.singleDomainPyramidOverride).toBe(false);
    expect(r.setType).toBe('straight');
  });
});
