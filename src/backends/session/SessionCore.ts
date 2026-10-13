import type { Page } from 'playwright';
import { NeuronWriterError, RetryableError, SessionExpiredError } from '../../errors.js';
import { Limiter } from '../../limiter.js';
import { APP_URL } from '../Backend.js';
import { BrowserSession } from './browser.js';
import { ENDPOINTS, OWN_REQUEST_HEADER, PAGES, type Endpoint, type EndpointName } from './endpoints.js';
import { interpretResponse } from './normalize.js';
import { readAnalysisSig } from './pageScripts/analysis.js';
import { looksLikeLoginPage, requestFromPage } from './pageScripts/common.js';

export const NAVIGATION_TIMEOUT_MS = 45_000;
export const LONG_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * What every session feature needs: one paced browser page, navigation that
 * fails fast when the session is gone, and the app's own request shapes sent
 * from inside the page so cookies apply as usual.
 */
export class SessionCore {
  constructor(
    readonly browser = new BrowserSession(),
    readonly limiter = new Limiter(),
  ) {}

  /** Navigates (as a paced read) and fails fast if the session is gone. */
  async open(path: string, signal?: AbortSignal): Promise<Page> {
    const release = this.browser.hold();
    try {
      return await this.navigate(path, signal);
    } finally {
      release();
    }
  }

  private async navigate(path: string, signal?: AbortSignal): Promise<Page> {
    const page = await this.browser.getPage();
    await this.limiter.run('read', async () => {
      const response = await page.goto(`${APP_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
      const status = response?.status() ?? 0;
      if (status === 404) throw new NeuronWriterError(`Not found: ${path}`, 'Check the id. Project ids come from nw_list_projects, query ids from nw_list_queries.');
      if (status === 429 || status >= 500) throw new RetryableError(`NeuronWriter answered HTTP ${status} for ${path}.`, status);
    }, signal);
    if (await page.evaluate(looksLikeLoginPage)) throw new SessionExpiredError();
    return page;
  }

  async openAnalysis(queryId: string, signal?: AbortSignal): Promise<Page> {
    const page = await this.open(PAGES.analysis(queryId), signal);
    if (!(await page.evaluate(readAnalysisSig))) {
      throw new NeuronWriterError(`Analysis ${queryId} is not ready or not found.`, 'Call nw_get_recommendations with wait_seconds to wait until it is ready.');
    }
    return page;
  }

  /** Sends one endpoint's request from the page. Only reads are retried: a repeated write could save or spend twice. */
  async post(page: Page, name: EndpointName, body: unknown, signal?: AbortSignal, timeoutMs = NAVIGATION_TIMEOUT_MS): Promise<Record<string, unknown>> {
    const release = this.browser.hold();
    try {
      return await this.send(page, name, body, signal, timeoutMs);
    } finally {
      release();
    }
  }

  private send(page: Page, name: EndpointName, body: unknown, signal?: AbortSignal, timeoutMs = NAVIGATION_TIMEOUT_MS): Promise<Record<string, unknown>> {
    const endpoint = ENDPOINTS[name];
    const encoding: 'json' | 'form' | 'get' = (endpoint as Endpoint).encoding ?? 'json';
    return this.limiter.run(endpoint.kind, async () => {
      const call = page.evaluate(requestFromPage, { path: endpoint.path, body, marker: OWN_REQUEST_HEADER, encoding });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new NeuronWriterError(`${endpoint.path} timed out.`, 'Retry later; check the result in nw_status or the web app before retrying a credit-spending call.')), timeoutMs).unref(),
      );
      try {
        return interpretResponse(await Promise.race([call, timeout]));
      } catch (error) {
        if (error instanceof RetryableError && endpoint.kind === 'write') {
          throw new NeuronWriterError(error.message, 'Do not retry blindly: check in the web app or with a read tool whether the change went through first.');
        }
        throw error;
      }
    }, signal);
  }

  close(): Promise<void> {
    return this.browser.close();
  }
}
