import { NeuronWriterError, NwError } from '../../errors.js';
import type { AccountStatus, Backend, ContentInput, ContentRevision, CreateQueryInput, Project, QuerySummary, Recommendations, Score } from '../Backend.js';
import type { SessionFeatures } from '../features.js';
import { PAGES } from './endpoints.js';
import { SessionAi } from './features/ai.js';
import { SessionAnalysis } from './features/analysis.js';
import { SessionPlanning } from './features/planning.js';
import { SessionProjects } from './features/projects.js';
import { SessionVisibility } from './features/visibility.js';
import { SessionLookup } from './features/lookup.js';
import { htmlToText, judgeTerms, recentAutosave, normalizeAnalysisPage, normalizeQueryRows, normalizeScore, parseProfileText, pickRevision } from './normalize.js';
import { buildCheckReadabilityBody, buildSaveContentBody, headingIdeasLoaded, readAnalysisPage, readAnalysisSig, readRevisions, readTermContext } from './pageScripts/analysis.js';
import { readProjectsNav, readQueriesTable } from './pageScripts/project.js';
import { SessionCore } from './SessionCore.js';

const HEADING_IDEAS_WAIT_MS = 10_000;

/**
 * Drives NeuronWriter through the owner's logged-in browser profile. The core
 * contract lives here; everything only the web app can do is in `features`.
 */
export class SessionBackend implements Backend {
  readonly name = 'session' as const;
  readonly features: SessionFeatures;

  constructor(private readonly core = new SessionCore()) {
    this.features = {
      analysis: new SessionAnalysis(core),
      ai: new SessionAi(core),
      planning: new SessionPlanning(core),
      projects: new SessionProjects(core),
      visibility: new SessionVisibility(core),
      lookup: new SessionLookup(core),
    };
  }

  async status(signal?: AbortSignal): Promise<AccountStatus> {
    const page = await this.core.open(PAGES.profile, signal);
    const text = await page.evaluate(() => document.body.innerText);
    return { backend: this.name, logged_in: true, ...parseProfileText(text) };
  }

  async listProjects(signal?: AbortSignal): Promise<Project[]> {
    const page = await this.core.open(PAGES.home, signal);
    const projects = await page.evaluate(readProjectsNav);
    return projects.map((p) => ({ ...p, language: null, engine: null }));
  }

  async listQueries(projectId: string, signal?: AbortSignal): Promise<QuerySummary[]> {
    const page = await this.core.open(PAGES.project(projectId), signal);
    const rows = await page.evaluate(readQueriesTable);
    if (rows === null) throw new NeuronWriterError(`Project ${projectId} was not found or has no Content Writer table.`, 'Call nw_list_projects to get valid project ids.');
    return normalizeQueryRows(rows);
  }

  async getRecommendations(queryId: string, signal?: AbortSignal): Promise<Recommendations> {
    const page = await this.core.open(PAGES.analysis(queryId), signal);
    if (await page.evaluate(readAnalysisSig)) {
      await page.waitForFunction(headingIdeasLoaded, null, { timeout: HEADING_IDEAS_WAIT_MS }).catch(() => undefined);
    }
    return normalizeAnalysisPage(queryId, await page.evaluate(readAnalysisPage));
  }

  async getContent(queryId: string, signal?: AbortSignal): Promise<ContentRevision> {
    const page = await this.core.openAnalysis(queryId, signal);
    const { analysis, revisions } = await page.evaluate(readRevisions);
    const revision = pickRevision(revisions);
    if (!revision) return { query_id: queryId, title: '', description: '', html: '', word_count: 0, saved_at: null };
    const data = await this.core.post(page, 'getContentRevision', { analysis, revision: revision.sig }, signal);
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
    const page = await this.core.openAnalysis(queryId, signal);
    const body = await page.evaluate(buildCheckReadabilityBody, contentArgs(input));
    const response = await this.core.post(page, 'checkReadability', body, signal);
    return { ...normalizeScore(response), terms: judgeTerms(await page.evaluate(readTermContext), response) };
  }

  async importContent(queryId: string, input: ContentInput, signal?: AbortSignal, options: { force?: boolean } = {}): Promise<Score> {
    const page = await this.core.openAnalysis(queryId, signal);
    if (!options.force) {
      const editing = recentAutosave((await page.evaluate(readRevisions)).revisions);
      if (editing) {
        throw new NwError(
          `The article is open in the NeuronWriter editor (autosaved at ${editing} UTC). Saving now could be overwritten by the editor, or overwrite its changes.`,
          'Ask the user to close the editor tab (or finish there), then retry; or pass force: true if they confirm it is safe.',
        );
      }
    }
    const args = contentArgs(input);
    await this.core.post(page, 'saveOptimizedContent', await page.evaluate(buildSaveContentBody, args), signal);
    const response = await this.core.post(page, 'checkReadability', await page.evaluate(buildCheckReadabilityBody, args), signal);
    return { ...normalizeScore(response), terms: judgeTerms(await page.evaluate(readTermContext), response) };
  }

  async createQuery(input: CreateQueryInput, signal?: AbortSignal): Promise<{ query_id: string | null }> {
    const page = await this.core.open(PAGES.project(input.project), signal);
    // Same body add_new_analysis() sends for a single keyword with the form's defaults.
    const data = await this.core.post(page, 'newAnalysis', {
      project: input.project,
      is_multiple_analysis: 0,
      keyword: input.keyword,
      multiple_keywords: '',
      custom_competitors: (input.custom_competitors ?? []).slice(0, 5).join('\n'),
      additional_keywords: (input.additional_keywords ?? []).join('\n'),
      target_url: input.target_url ?? '',
      engine: input.engine,
      language: input.language,
      prefer_lang: '',
      update_inventory: 0,
      assigned_to: '',
      deadline: '',
      geolocation_mode: input.geolocation ? 'city' : 'country',
      geolocation: input.geolocation ?? null,
    }, signal);
    if (data.update_status === 'ask') {
      // The target URL already belongs to another keyword in the project inventory; the app asks before moving it.
      throw new NeuronWriterError(`NeuronWriter asks before changing the target URL: ${htmlToText(JSON.stringify(data.question_data ?? '')) ?? 'URL collision'}`, 'Create the analysis without target_url, or set it later with nw_update_analysis.');
    }
    const queries = await this.listQueries(input.project, signal);
    const created = queries.find((q) => q.keyword.trim() === input.keyword.trim());
    return { query_id: created?.id ?? null };
  }

  close(): Promise<void> {
    return this.core.close();
  }
}

function contentArgs(input: ContentInput) {
  return { html: input.html, title: input.title ?? '', description: input.description ?? '' };
}
