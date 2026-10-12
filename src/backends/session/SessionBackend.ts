import type { Page } from 'playwright';
import { NeuronWriterError, RetryableError, SessionExpiredError } from '../../errors.js';
import { Limiter, type RequestKind } from '../../limiter.js';
import { AI_MODELS, APP_URL, type AccountStatus, type AiKind, type AiRequest, type AiResult, type Backend, type CompetitorSelection, type ContentInput, type ContentPlanIdea, type ContentRevision, type CreateQueryInput, type PageContent, type Project, type ProjectSettings, type ProjectSettingsPatch, type QuerySummary, type Recommendations, type Score } from '../Backend.js';
import { BrowserSession } from './browser.js';
import { ENDPOINTS, OWN_REQUEST_HEADER, PAGES, type EndpointName } from './endpoints.js';
import { applySettingsPatch, interpretResponse, normalizeAnalysisPage, normalizeContentPlan, normalizeQueryRows, normalizeScore, parseAiUsage, parseProfileText, pickRevision, toProjectSettings } from './normalize.js';
import {
  buildAiBody,
  buildCheckReadabilityBody,
  buildSaveContentBody,
  buildUrlImportBody,
  headingIdeasLoaded,
  looksLikeLoginPage,
  postFromPage,
  readAnalysisPage,
  readAnalysisSig,
  readCompetitorSwitches,
  readContentPlan,
  readProjectSettingsForm,
  readProjectsNav,
  readQueriesTable,
  readRevisions,
} from './pageScripts.js';

const NAVIGATION_TIMEOUT_MS = 45_000;

/** Templates the web app itself uses for each kind (outline and meta are the Content Designer's). */
const AI_TEMPLATES: Record<AiKind, string> = {
  outline: 'content-designer-blog-outline',
  meta: 'content-designer-meta-title-and-description',
  intro: 'intro-terms',
  paragraph: 'paragraph-heading-terms',
  faq: 'faq-basicterms-extendedterms',
  rephrase: 'basic-rephrase',
  expand: 'basic-expand',
  article: 'one-click-long-form',
};
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

  async generateAi(queryId: string, request: AiRequest, signal?: AbortSignal): Promise<AiResult> {
    const page = await this.openAnalysis(queryId, signal);
    const body = await page.evaluate(buildAiBody, {
      template: AI_TEMPLATES[request.kind],
      wizardMode: null,
      title: request.title ?? '',
      text: request.text ?? '',
      heading: request.heading ?? '',
      tone: request.tone ?? '',
      wordCount: request.word_count ?? 300,
      model: AI_MODELS[request.model ?? 'default'],
      html: '',
    });
    const data = await this.post(page, 'generateAiContent', body, signal, AI_TIMEOUT_MS);
    const isMeta = request.kind === 'meta';
    return {
      content: String(data.content ?? ''),
      title: isMeta ? String(data.first_gen_content ?? '') : null,
      usage: parseAiUsage(data.ai_usage_info),
    };
  }

  async setTags(projectId: string, queryId: string, tags: string[], signal?: AbortSignal): Promise<void> {
    const page = await this.open(PAGES.project(projectId), signal);
    await this.post(page, 'updateTagsStatus', { project: projectId, mode: 'status', object_type: 'analysis', object_id: queryId, value: tags.join(', '), table_pos: null }, signal);
  }

  async selectCompetitors(queryId: string, selection: CompetitorSelection, signal?: AbortSignal): Promise<string[]> {
    const page = await this.openAnalysis(queryId, signal);
    const analysis = await page.evaluate(readAnalysisSig);
    if (selection.mode === 'custom') {
      const available = (await page.evaluate(readCompetitorSwitches)).map((c) => c.url);
      const keep = new Set(selection.keep_urls);
      const unknown = selection.keep_urls.filter((url) => !available.includes(url));
      if (unknown.length) throw new NeuronWriterError(`Not competitors of this analysis: ${unknown.join(', ')}`, 'Use URLs exactly as nw_get_recommendations lists them.');
      if (keep.size < 3) throw new NeuronWriterError('Keep at least 3 competitors (NeuronWriter advises 5 or more).', 'Pass more URLs in keep_urls.');
      await this.post(page, 'selectCompetitors', { analysis, exclude_choices: available.filter((url) => !keep.has(url)) }, signal);
    } else {
      await this.post(page, 'selectCompetitors', { analysis, include_mode: selection.mode === 'top10' ? 'TOP10' : 'TOP30' }, signal);
    }
    const after = await this.openAnalysis(queryId, signal);
    return (await after.evaluate(readCompetitorSwitches)).filter((c) => c.selected).map((c) => c.url);
  }

  async fetchPage(queryId: string, url: string, signal?: AbortSignal): Promise<PageContent> {
    const page = await this.openAnalysis(queryId, signal);
    const data = await this.post(page, 'autoImportContent', await page.evaluate(buildUrlImportBody, { url }), signal, AI_TIMEOUT_MS);
    const content = (data.content ?? {}) as Record<string, unknown>;
    return { url, title: String(content.title ?? ''), description: String(content.description ?? ''), html: String(content.content ?? '') };
  }

  async listContentPlan(projectId: string, signal?: AbortSignal): Promise<ContentPlanIdea[]> {
    const page = await this.open(PAGES.contentPlan(projectId), signal);
    return normalizeContentPlan(await page.evaluate(readContentPlan));
  }

  async addContentPlanIdea(projectId: string, keyword: string, additionalKeywords: string[], signal?: AbortSignal): Promise<void> {
    const page = await this.open(PAGES.contentPlan(projectId), signal);
    await this.post(page, 'addToContentPlan', { project: projectId, keyword, additional_keywords: additionalKeywords.join('\n') }, signal);
  }

  async getProjectSettings(projectId: string, signal?: AbortSignal): Promise<ProjectSettings> {
    const { form, keywords } = await this.readSettings(projectId, signal);
    return toProjectSettings(projectId, form, keywords);
  }

  async updateProjectSettings(projectId: string, patch: ProjectSettingsPatch, signal?: AbortSignal): Promise<ProjectSettings> {
    const { page, form, keywords } = await this.readSettings(projectId, signal);
    await this.post(page, 'updateProjectSettings', { project: projectId, ...applySettingsPatch(form, keywords, patch) }, signal);
    return this.getProjectSettings(projectId, signal);
  }

  /** The settings form (DOM) plus the four keyword lists (endpoint), i.e. everything the Save button sends. */
  private async readSettings(projectId: string, signal?: AbortSignal) {
    const page = await this.open(PAGES.projectSettings(projectId), signal);
    const form = await page.evaluate(readProjectSettingsForm);
    if (!form) throw new NeuronWriterError(`Project ${projectId} settings were not found.`, 'Call nw_list_projects to get valid project ids.');
    const data = await this.post(page, 'getProjectSettings', { tab: '', project: projectId }, signal);
    const keywords = (data.project_keywords ?? {}) as Record<string, unknown>;
    return { page, form, keywords };
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
