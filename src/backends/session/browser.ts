import { chmod, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { log } from '../../log.js';
import { APP_URL } from '../Backend.js';
import { OWN_REQUEST_HEADER } from './endpoints.js';

export const DEFAULT_PROFILE_DIR = join(homedir(), '.neuronwriter-mcp', 'profile');
const IDLE_CLOSE_MS = 10 * 60 * 1000;
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
  const options = { headless, viewport: { width: 1280, height: 900 } };
  try {
    return await chromium.launchPersistentContext(dir, { ...options, channel: 'chrome' });
  } catch (error) {
    log('Google Chrome not available, falling back to bundled Chromium:', (error as Error).message.split('\n')[0]);
    return chromium.launchPersistentContext(dir, options);
  }
}

/**
 * One warm headless page on the owner's persistent profile. Launched on first
 * use, closed after 10 minutes idle. Only requests we send ourselves may reach
 * /backend/*: the editor's own autosave and polling are aborted, so opening an
 * analysis page can never change it.
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
      if (request.url().startsWith(`${APP_URL}/backend/`) && !request.headers()[OWN_REQUEST_HEADER]) return route.abort();
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
