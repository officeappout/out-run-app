import { describe, expect, it, vi } from 'vitest';
import { createProgramMetaCache } from '../program-meta-cache';

describe('createProgramMetaCache', () => {
  it('fetches each programId once, sharing the in-flight promise', async () => {
    const fetcher = vi.fn(async (id: string) => ({ id }));
    const get = createProgramMetaCache(fetcher);
    const [a, b] = await Promise.all([get('pull'), get('pull')]);
    await get('pull');
    expect(a).toEqual({ id: 'pull' });
    expect(b).toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await get('push');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not keep a null result — the next call retries', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'x' });
    const get = createProgramMetaCache(fetcher);
    expect(await get('x')).toBeNull();
    expect(await get('x')).toEqual({ id: 'x' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failure — the next call retries', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'y' });
    const get = createProgramMetaCache(fetcher);
    await expect(get('y')).rejects.toThrow('offline');
    expect(await get('y')).toEqual({ id: 'y' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
