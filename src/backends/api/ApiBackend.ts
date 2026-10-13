// Official API v0.5 (Gold+ only). The HTTP client and endpoint calls come from
// softreviewed/neuronwriter-mcp-server (MIT, see THIRD_PARTY_NOTICES.md).
// Not exercised against the live API yet: the owner's plan has no key.

import axios, { type AxiosInstance } from 'axios';
import { NeuronWriterError, PlanLimitError, RetryableError, isPlanLimitMessage } from '../../errors.js';
import { Limiter, type RequestKind } from '../../limiter.js';
import { sanitizeExternalText } from '../../sanitize.js';
import { analysisUrl, type AccountStatus, type Backend, type ContentInput, type ContentRevision, type CreateQueryInput, type Project, type QuerySummary, type Recommendations, type Score, type TermRange } from '../Backend.js';

const API_ENDPOINT = 'https://app.neuronwriter.com/neuron-api/0.5/writer';

export class ApiBackend implements Backend {
  readonly name = 'api' as const;
  private readonly apiClient: AxiosInstance;

  constructor(apiKey: string, private readonly limiter = new Limiter()) {
    this.apiClient = axios.create({
      baseURL: API_ENDPOINT,
      timeout: 120_000,
      headers: {
        'X-API-KEY': apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  async status(): Promise<AccountStatus> {
    // The API exposes no usage endpoint; a successful list-projects proves the key works.
    await this.call('read', '/list-projects', {});
    return { backend: this.name, logged_in: true, plan: null, content_writer: null, ai_credits: null, projects: null, resets_at: null };
  }

  async listProjects(signal?: AbortSignal): Promise<Project[]> {
    const data = await this.call<Array<Record<string, unknown>>>('read', '/list-projects', {}, signal);
    return (Array.isArray(data) ? data : []).map((p) => ({
      id: String(p.project ?? ''),
      name: String(p.name ?? ''),
      language: typeof p.language === 'string' ? p.language : null,
      engine: typeof p.engine === 'string' ? p.engine : null,
    }));
  }

  async listQueries(projectId: string, signal?: AbortSignal): Promise<QuerySummary[]> {
    const data = await this.call<Array<Record<string, unknown>>>('read', '/list-queries', { project: projectId }, signal);
    return (Array.isArray(data) ? data : []).map((q) => {
      const id = String(q.query ?? q.id ?? '');
      return {
        id,
        keyword: String(q.keyword ?? ''),
        created: typeof q.created === 'string' ? q.created : null,
        engine: typeof q.engine === 'string' ? q.engine : null,
        content_score: null,
        word_count: null,
        tags: Array.isArray(q.tags) ? q.tags.map(String) : typeof q.tags === 'string' && q.tags ? [q.tags] : [],
        url: analysisUrl(id),
      };
    });
  }

  async getRecommendations(queryId: string, signal?: AbortSignal): Promise<Recommendations> {
    return normalizeApiQuery(queryId, await this.call('read', '/get-query', { query: queryId }, signal));
  }

  async getContent(queryId: string, signal?: AbortSignal): Promise<ContentRevision> {
    const data = await this.call<Record<string, unknown>>('read', '/get-content', { query: queryId, revision_type: 'manual' }, signal);
    return {
      query_id: queryId,
      title: String(data.title ?? ''),
      description: String(data.description ?? ''),
      html: String(data.content ?? ''),
      word_count: null,
      saved_at: typeof data.created === 'string' ? data.created : null,
    };
  }

  async scoreContent(queryId: string, input: ContentInput, signal?: AbortSignal): Promise<Score> {
    return toScore(await this.call('read', '/evaluate-content', { query: queryId, ...input }, signal));
  }

  async importContent(queryId: string, input: ContentInput, signal?: AbortSignal): Promise<Score> {
    return toScore(await this.call('write', '/import-content', { query: queryId, ...input }, signal));
  }

  async createQuery(input: CreateQueryInput, signal?: AbortSignal): Promise<{ query_id: string | null }> {
    const data = await this.call<Record<string, unknown>>('write', '/new-query', { ...input }, signal);
    return { query_id: typeof data.query === 'string' ? data.query : null };
  }

  async close(): Promise<void> {}

  private call<T = Record<string, unknown>>(kind: RequestKind, path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.limiter.run(kind, async () => {
      try {
        const response = await this.apiClient.post(path, body, { signal });
        const data = response.data as Record<string, unknown>;
        if (data && typeof data === 'object' && typeof data.error === 'string') {
          throw isPlanLimitMessage(data.error) ? new PlanLimitError(data.error) : new NeuronWriterError(data.error);
        }
        return data as T;
      } catch (error) {
        if (!axios.isAxiosError(error)) throw error;
        const status = error.response?.status ?? 0;
        if ((status === 429 || status >= 500) && kind === 'read') throw new RetryableError(`API error: HTTP ${status}`, status);
        const message = (error.response?.data as { message?: string; error?: string } | undefined);
        throw new NeuronWriterError(`API error: ${message?.error ?? message?.message ?? error.message}`, status === 401 || status === 403 ? 'Check NEURONWRITER_API_KEY (Profile → Neuron API access; Gold plan or higher).' : undefined);
      }
    }, signal);
  }
}

function toScore(data: Record<string, unknown>): Score {
  return { content_score: typeof data.content_score === 'number' ? data.content_score : null, word_count: null, readability: null, details: null };
}

const lines = (value: unknown): string[] =>
  typeof value === 'string' ? value.split('\n').map((l) => l.trim()).filter(Boolean) : [];

/** "trail running shoe: 6-21x" → { term, min: 6, max: 21 } */
export function parseRangeLine(line: string): TermRange {
  const match = line.match(/^(.*?):\s*(\d+)\s*-\s*(\d+)x?$/);
  if (!match) return { term: line, min: null, max: null };
  return { term: match[1].trim(), min: Number(match[2]), max: Number(match[3]) };
}

/** Maps the API's get-query response onto the shared Recommendations shape. */
export function normalizeApiQuery(queryId: string, raw: Record<string, unknown>): Recommendations {
  const metrics = (raw.metrics ?? {}) as Record<string, { target?: number }>;
  const txt = (raw.terms_txt ?? {}) as Record<string, unknown>;
  const ideas = (raw.ideas ?? {}) as Record<string, unknown>;
  const questionList = (value: unknown) => (Array.isArray(value) ? value.map((q) => (typeof q === 'string' ? q : (q as { q?: string })?.q)).filter((q): q is string => !!q) : []);
  const questions = [...new Set([...questionList(ideas.suggest_questions), ...questionList(ideas.people_also_ask), ...questionList(ideas.content_questions)])];
  const competitors = Array.isArray(raw.competitors) ? (raw.competitors as Array<Record<string, unknown>>) : [];
  return {
    query_id: queryId,
    keyword: typeof raw.keyword === 'string' ? raw.keyword : null,
    status: raw.status === 'ready' ? 'ready' : 'not_ready',
    targets: { word_count: metrics.word_count?.target ?? null, readability: metrics.readability?.target ?? null },
    terms: {
      content_basic: lines(txt.content_basic_w_ranges).map(parseRangeLine),
      content_extended: lines(txt.content_extended).map((term) => ({ term, min: null, max: null })),
      title: lines(txt.title),
      description: lines(txt.desc_title),
      h1: lines(txt.h1),
      h2: lines(txt.h2),
      entities: typeof txt.entities === 'string' ? txt.entities.split(',').map((e) => e.trim()).filter(Boolean) : [],
      excluded: [],
      custom: { text: [], h1: [], h2: [] },
      custom_ranges: {},
    },
    ideas: { headings: [], questions: questions.map((q) => sanitizeExternalText(q)).filter((q): q is string => q !== null) },
    competitors: competitors.map((c, index) => ({
      rank: typeof c.rank === 'number' ? c.rank : index + 1,
      url: sanitizeExternalText(c.url, 500) ?? '',
      title: sanitizeExternalText(c.title),
      content_score: typeof c.content_score === 'number' ? c.content_score : null,
      word_count: null,
      headings: [],
    })),
  };
}
