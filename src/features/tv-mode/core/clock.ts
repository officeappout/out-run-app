import { TV_CLOCK_SAMPLES } from './constants';

/**
 * Server-clock offset learned from the host heartbeat (`hostBeatAt` is stamped by the server).
 * A snapshot always arrives AFTER the stamp, so `serverStamp − localReceive` under-estimates
 * the offset by the delivery latency; the largest recent sample is the lowest-latency one.
 */
export class ServerClock {
  private samples: number[] = [];
  private readonly max: number;
  constructor(max: number = TV_CLOCK_SAMPLES) {
    this.max = max;
  }

  /** Feed one (server stamp, local receive time) pair. */
  sample(serverMs: number, localReceiveMs: number): void {
    this.samples.push(serverMs - localReceiveMs);
    if (this.samples.length > this.max) this.samples.shift();
  }

  get offsetMs(): number {
    return this.samples.length ? Math.max(...this.samples) : 0;
  }

  get ready(): boolean {
    return this.samples.length > 0;
  }

  now(localNowMs: number): number {
    return localNowMs + this.offsetMs;
  }
}
