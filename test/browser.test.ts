import { describe, expect, it } from 'vitest';
import { isProfileLocked, launchWithLockRetry } from '../src/backends/session/browser.js';
import { NwError } from '../src/errors.js';

const locked = () => new Error('browserType.launchPersistentContext: Failed to create a ProcessSingleton for your profile directory.');

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

describe('profile lock', () => {
  it('recognizes Chromium\'s lock error only', () => {
    expect(isProfileLocked(locked())).toBe(true);
    expect(isProfileLocked(new Error('Executable doesn\'t exist'))).toBe(false);
  });

  it('waits while another process holds the profile, then launches', async () => {
    let calls = 0;
    const c = clock();
    const result = await launchWithLockRetry(async () => {
      if (++calls < 3) throw locked();
      return 'ctx';
    }, { waitMs: 60_000, ...c });
    expect(result).toBe('ctx');
    expect(calls).toBe(3);
  });

  it('gives up after the wait with a next step', async () => {
    const c = clock();
    await expect(launchWithLockRetry(async () => { throw locked(); }, { waitMs: 10_000, ...c })).rejects.toBeInstanceOf(NwError);
  });

  it('does not retry other launch errors', async () => {
    let calls = 0;
    await expect(launchWithLockRetry(async () => { calls++; throw new Error('boom'); }, clock())).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });
});
