import { describe, expect, it } from 'vitest';
import { RetryableError } from '../src/errors.js';
import { Limiter } from '../src/limiter.js';

function fakeClock() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    sleeps,
    advance: (ms: number) => (now += ms),
  };
}

const options = (clock: ReturnType<typeof fakeClock>) => ({
  readGapMs: 300,
  writeGapMs: 1500,
  maxRetries: 3,
  baseBackoffMs: 1000,
  now: clock.now,
  sleep: clock.sleep,
  random: () => 1,
});

describe('Limiter', () => {
  it('runs tasks one at a time in FIFO order', async () => {
    const clock = fakeClock();
    const limiter = new Limiter(options(clock));
    const order: string[] = [];
    let running = 0;
    const task = (name: string) => async () => {
      running++;
      expect(running).toBe(1);
      order.push(name);
      await Promise.resolve();
      running--;
      return name;
    };
    const results = await Promise.all([limiter.run('read', task('a')), limiter.run('write', task('b')), limiter.run('read', task('c'))]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('waits the write gap before a write and the read gap before a read', async () => {
    const clock = fakeClock();
    const limiter = new Limiter(options(clock));
    await limiter.run('read', async () => 1);
    await limiter.run('write', async () => 2);
    await limiter.run('read', async () => 3);
    expect(clock.sleeps).toEqual([1500, 300]);
  });

  it('does not wait when enough time has passed', async () => {
    const clock = fakeClock();
    const limiter = new Limiter(options(clock));
    await limiter.run('write', async () => 1);
    clock.advance(5000);
    await limiter.run('write', async () => 2);
    expect(clock.sleeps).toEqual([]);
  });

  it('retries RetryableError with exponential backoff, then gives up', async () => {
    const clock = fakeClock();
    const limiter = new Limiter(options(clock));
    let calls = 0;
    await expect(
      limiter.run('read', async () => {
        calls++;
        throw new RetryableError('busy', 503);
      }),
    ).rejects.toThrow('busy');
    expect(calls).toBe(4);
    // backoff (random = 1 → full backoff) followed by the read gap before each retry
    expect(clock.sleeps).toEqual([1000, 2000, 4000]);
  });

  it('does not retry other errors and keeps the queue alive', async () => {
    const clock = fakeClock();
    const limiter = new Limiter(options(clock));
    let calls = 0;
    await expect(limiter.run('read', async () => { calls++; throw new Error('boom'); })).rejects.toThrow('boom');
    expect(calls).toBe(1);
    await expect(limiter.run('read', async () => 'next')).resolves.toBe('next');
  });

  it('stops before running when the signal is already aborted', async () => {
    const limiter = new Limiter(options(fakeClock()));
    const controller = new AbortController();
    controller.abort();
    let ran = false;
    await expect(limiter.run('read', async () => { ran = true; }, controller.signal)).rejects.toThrow();
    expect(ran).toBe(false);
  });
});
