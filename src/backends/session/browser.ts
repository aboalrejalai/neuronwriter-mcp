import { chmod, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { NwError } from '../../errors.js';
import { log } from '../../log.js';
import { APP_URL } from '../Backend.js';
import { OWN_REQUEST_HEADER, PAGE_ALLOWED_READS } from './endpoints.js';

export const DEFAULT_PROFILE_DIR = join(homedir(), '.neuronwriter-mcp', 'profile');
// Short, so another MCP process (a second Claude/Cursor session) can take the profile soon after.
const IDLE_CLOSE_MS = 3 * 60 * 1000;
const PROFILE_LOCK_WAIT_MS = 60_000;
const BLOCKED_RESOURCES = new Set(['image', 'media', 'font', 'stylesheet']);

export function profileDir(): string {
  return process.env.NW_PROFILE_DIR || DEFAULT_PROFILE_DIR;
}

export async function ensureProfileDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
}

export async function launchContext(dir: string, headless: boolean): Promise<BrowserContext> {
  await ensureProfileDir(dir);
  return launchWithLockRetry(() => launchOnce(dir, headless));
}

async function launchOnce(dir: string, headless: boolean): Promise<BrowserContext> {
  const options = { headless, viewport: { width: 1280, height: 900 } };
  try {
    return await chromium.launchPersistentContext(dir, { ...options, channel: 'chrome' });
  } catch (error) {
    if (isProfileLocked(error)) throw error;
    log('Google Chrome not available, falling back to bundled Chromium:', (error as Error).message.split('\n')[0]);
    return chromium.launchPersistentContext(dir, options);
  }
}

/** Chromium refuses a second process on the same profile ("Failed to create a ProcessSingleton"). */
export function isProfileLocked(error: unknown): boolean {
  return error instanceof Error && /ProcessSingleton|SingletonLock|profile is already in use/i.test(error.message);
}

/** Waits (with backoff) while another process holds the profile, then gives the agent a next step. */
export async function launchWithLockRetry<T>(
  launch: () => Promise<T>,
  { waitMs = PROFILE_LOCK_WAIT_MS, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), now = Date.now } = {},
): Promise<T> {
  const deadline = now() + waitMs;
  for (let attempt = 0; ; attempt++) {
    try {
      return await launch();
    } catch (error) {
      if (!isProfileLocked(error)) throw error;
      if (now() >= deadline) {
        throw new NwError(
          'Another NeuronWriter MCP session is using the browser profile.',
          'Retry in a minute: the other Claude/Cursor session releases it after 3 idle minutes. If `npm run login` is open, finish or close it first.',
        );
      }
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
    }
  }
}

/**
 * One warm headless page on the owner's persistent profile. Launched on first
 * use, closed after 10 minutes idle. Only requests we send ourselves and the
 * page's own load-time reads may reach /backend/*: the editor's autosave and
 * every other write are aborted, so opening an analysis page can never change it.
 */
export class BrowserSession {
  private context: BrowserContext | null = null;
  private page: Promise<Page> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(private readonly dir = profileDir()) {}

  async getPage(): Promise<Page> {
    this.touch();
    this.page ??= this.open().catch((error) => {
      this.page = null;
      throw error;
    });
    return this.page;
  }

  private async open(): Promise<Page> {
    const context = await launchContext(this.dir, true);
    this.context = context;
    // Some runners (tsx) wrap functions with a __name helper that does not exist in the page.
    await context.addInitScript('globalThis.__name = globalThis.__name || ((fn) => fn);');
    await context.route('**/*', (route) => {
      const request = route.request();
      if (BLOCKED_RESOURCES.has(request.resourceType())) return route.abort();
      const url = request.url();
      if (url.startsWith(`${APP_URL}/backend/`) && !request.headers()[OWN_REQUEST_HEADER]) {
        const path = url.slice(`${APP_URL}/backend/`.length);
        if (!PAGE_ALLOWED_READS.some((allowed) => path.startsWith(allowed))) return route.abort();
      }
      return route.continue();
    });
    context.on('close', () => {
      this.context = null;
      this.page = null;
    });
    return context.pages()[0] ?? context.newPage();
  }

  private touch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.close(), IDLE_CLOSE_MS);
    this.idleTimer.unref();
  }

  async close(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const context = this.context;
    this.context = null;
    this.page = null;
    await context?.close().catch(() => undefined);
  }
}
