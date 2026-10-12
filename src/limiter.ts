import { RetryableError } from './errors.js';

export type RequestKind = 'read' | 'write';

export interface LimiterOptions {
  readGapMs: number;
  writeGapMs: number;
  maxRetries: number;
  baseBackoffMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export const DEFAULT_LIMITER_OPTIONS: LimiterOptions = {
  readGapMs: 300,
  writeGapMs: 1500,
  maxRetries: 3,
  baseBackoffMs: 2000,
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Human pacing for NeuronWriter: one request at a time (FIFO), a minimum gap
 * before each request (longer before writes), and exponential backoff with
 * jitter on 429/5xx.
 */
export class Limiter {
  private chain: Promise<unknown> = Promise.resolve();
  private lastFinishedAt = Number.NEGATIVE_INFINITY;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly options: LimiterOptions = DEFAULT_LIMITER_OPTIONS) {
    this.sleep = options.sleep ?? realSleep;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  run<T>(kind: RequestKind, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const task = this.chain.then(() => this.execute(kind, fn, signal));
    this.chain = task.catch(() => undefined);
    return task;
  }

  private async execute<T>(kind: RequestKind, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const gap = kind === 'write' ? this.options.writeGapMs : this.options.readGapMs;
      const wait = this.lastFinishedAt + gap - this.now();
      if (wait > 0) await this.sleep(wait);
      signal?.throwIfAborted();
      try {
        const result = await fn();
        this.lastFinishedAt = this.now();
        return result;
      } catch (error) {
        this.lastFinishedAt = this.now();
        if (!(error instanceof RetryableError) || attempt >= this.options.maxRetries) throw error;
        const backoff = this.options.baseBackoffMs * 2 ** attempt;
        await this.sleep(backoff / 2 + this.random() * (backoff / 2));
      }
    }
  }
}
