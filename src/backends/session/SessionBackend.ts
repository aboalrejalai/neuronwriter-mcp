import type { Page } from 'playwright';
import { NeuronWriterError, RetryableError, SessionExpiredError } from '../../errors.js';
import { Limiter, type RequestKind } from '../../limiter.js';
import { APP_URL, type AccountStatus, type Backend, type ContentInput, type ContentRevision, type CreateQueryInput, type Outline, type Project, type QuerySummary, type Recommendations, type Score } from '../Backend.js';
import { BrowserSession } from './browser.js';
import { ENDPOINTS, OWN_REQUEST_HEADER, PAGES, type EndpointName } from './endpoints.js';
import { interpretResponse, normalizeAnalysisPage, normalizeQueryRows, normalizeScore, parseProfileText, pickRevision } from './normalize.js';
import {
  buildCheckReadabilityBody,
  buildOutlineBody,
  buildSaveContentBody,
  headingIdeasLoaded,
  looksLikeLoginPage,
  postFromPage,
  readAnalysisPage,
  readAnalysisSig,
  readProjectsNav,
  readQueriesTable,
  readRevisions,
} from './pageScripts.js';

const NAVIGATION_TIMEOUT_MS = 45_000;
const AI_TIMEOUT_MS = 10 * 60 * 1000;
const HEADING_IDEAS_WAIT_MS = 10_000;

/**
 * Drives NeuronWriter through the owner's logged-in browser profile: pages are
 * read with page.evaluate, actions are the same /backend/* POSTs the web app
 * sends, issued from inside the page so cookies apply as usual.
 */
export class SessionBackend implements Backend {
  readonly name = 'session' as const;

  constructor(
    private readonly browser = new BrowserSession(),
    private readonly limiter = new Limiter(),
  ) {}

  async status(signal?: AbortSignal): Promise<AccountStatus> {
    const page = await this.open(PAGES.profile, signal);
    const text = await page.evaluate(() => document.body.innerText);
    return { backend: this.name, logged_in: true, ...parseProfileText(text) };
  }

  async listProjects(signal?: AbortSignal): Promise<Project[]> {
    const page = await this.open(PAGES.home, signal);
    const projects = await page.evaluate(readProjectsNav);
    return projects.map((p) => ({ ...p, language: null, engine: null }));
  }

  async listQueries(projectId: string, signal?: AbortSignal): Promise<QuerySummary[]> {
    const page = await this.open(PAGES.project(projectId), signal);
    const rows = await page.evaluate(readQueriesTable);
    if (rows === null) throw new NeuronWriterError(`Project ${projectId} was not found or has no Content Writer table.`, 'Call nw_list_projects to get valid project ids.');
    return normalizeQueryRows(rows);
  }

  async getRecommendations(queryId: string, signal?: AbortSignal): Promise<Recommendations> {
    const page = await this.open(PAGES.analysis(queryId), signal);
    if (await page.evaluate(readAnalysisSig)) {
      await page.waitForFunction(headingIdeasLoaded, null, { timeout: HEADING_IDEAS_WAIT_MS }).catch(() => undefined);
    }
    return normalizeAnalysisPage(queryId, await page.evaluate(readAnalysisPage));
  }

  async getContent(queryId: string, signal?: AbortSignal): Promise<ContentRevision> {
    const page = await this.openAnalysis(queryId, signal);
    const { analysis, revisions } = await page.evaluate(readRevisions);
    const revision = pickRevision(revisions);
    if (!revision) return { query_id: queryId, title: '', description: '', html: '', word_count: 0, saved_at: null };
    const data = await this.post(page, 'getContentRevision', { analysis, revision: revision.sig }, signal);
    const content = (data.content ?? {}) as Record<string, unknown>;
    return {
      query_id: queryId,
      title: String(content.title ?? ''),
      description: String(content.description ?? ''),
      html: String(content.content ?? ''),
      word_count: typeof content.word_count === 'number' ? content.word_count : null,
      saved_at: revision.savedAt,
    };
  }

  async scoreContent(queryId: string, input: ContentInput, signal?: AbortSignal): Promise<Score> {
    const page = await this.openAnalysis(queryId, signal);
    const body = await page.evaluate(buildCheckReadabilityBody, contentArgs(input));
    return normalizeScore(await this.post(page, 'checkReadability', body, signal));
  }

  async importContent(queryId: string, input: ContentInput, signal?: AbortSignal): Promise<Score> {
    const page = await this.openAnalysis(queryId, signal);
    const args = contentArgs(input);
    await this.post(page, 'saveOptimizedContent', await page.evaluate(buildSaveContentBody, args), signal);
    return normalizeScore(await this.post(page, 'checkReadability', await page.evaluate(buildCheckReadabilityBody, args), signal));
  }

  async setDone(queryId: string, done: boolean, signal?: AbortSignal): Promise<void> {
    const page = await this.openAnalysis(queryId, signal);
    const analysis = await page.evaluate(readAnalysisSig);
    await this.post(page, done ? 'markContentAsDone' : 'unmarkContentAsDone', { analysis }, signal);
  }

  async createQuery(input: CreateQueryInput, signal?: AbortSignal): Promise<{ query_id: string | null }> {
    const page = await this.open(PAGES.project(input.project), signal);
    // Same body add_new_analysis() sends for a single keyword with the form's defaults.
    await this.post(page, 'newAnalysis', {
      project: input.project,
      is_multiple_analysis: 0,
      keyword: input.keyword,
      multiple_keywords: '',
      custom_competitors: '',
      additional_keywords: (input.additional_keywords ?? []).join('\n'),
      target_url: '',
      engine: input.engine,
      language: input.language,
      prefer_lang: '',
      update_inventory: 0,
      assigned_to: '',
      deadline: '',
      geolocation_mode: 'country',
      geolocation: null,
    }, signal);
    const queries = await this.listQueries(input.project, signal);
    const created = queries.find((q) => q.keyword.trim() === input.keyword.trim());
    return { query_id: created?.id ?? null };
  }

  async generateOutline(queryId: string, signal?: AbortSignal): Promise<Outline> {
    const page = await this.openAnalysis(queryId, signal);
    const data = await this.post(page, 'generateAiOutline', await page.evaluate(buildOutlineBody), signal, AI_TIMEOUT_MS);
    return { content: String(data.content ?? ''), ai_credits: typeof data.ai_credits === 'number' ? data.ai_credits : null };
  }

  close(): Promise<void> {
    return this.browser.close();
  }

  /** Navigates (as a paced read) and fails fast if the session is gone. */
  private async open(path: string, signal?: AbortSignal): Promise<Page> {
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

  private async openAnalysis(queryId: string, signal?: AbortSignal): Promise<Page> {
    const page = await this.open(PAGES.analysis(queryId), signal);
    if (!(await page.evaluate(readAnalysisSig))) {
      throw new NeuronWriterError(`Analysis ${queryId} is not ready or not found.`, 'Call nw_get_recommendations with wait_seconds to wait until it is ready.');
    }
    return page;
  }

  private post(page: Page, name: EndpointName, body: unknown, signal?: AbortSignal, timeoutMs = NAVIGATION_TIMEOUT_MS): Promise<Record<string, unknown>> {
    const endpoint = ENDPOINTS[name];
    const kind: RequestKind = endpoint.kind;
    return this.limiter.run(kind, async () => {
      const call = page.evaluate(postFromPage, { path: endpoint.path, body, marker: OWN_REQUEST_HEADER });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new NeuronWriterError(`${endpoint.path} timed out.`, 'Retry later; check the result in nw_status or the web app before retrying a credit-spending call.')), timeoutMs).unref(),
      );
      try {
        return interpretResponse(await Promise.race([call, timeout]));
      } catch (error) {
        // Only reads are retried: a repeated write could save twice or spend credits twice.
        if (error instanceof RetryableError && kind === 'write') {
          throw new NeuronWriterError(error.message, 'Do not retry blindly: check in the web app or with a read tool whether the change went through first.');
        }
        throw error;
      }
    }, signal);
  }
}

function contentArgs(input: ContentInput) {
  return { html: input.html, title: input.title ?? '', description: input.description ?? '' };
}
