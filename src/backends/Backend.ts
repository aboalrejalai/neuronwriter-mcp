// The contract both backends implement. Tools only talk to this interface,
// so they behave the same whichever backend answers.

export type BackendName = 'session' | 'api';

export interface Usage {
  used: number;
  limit: number;
}

export interface AccountStatus {
  backend: BackendName;
  logged_in: boolean;
  plan: string | null;
  content_writer: Usage | null;
  ai_credits: Usage | null;
  projects: Usage | null;
  resets_at: string | null;
}

export interface Project {
  id: string;
  name: string;
  language: string | null;
  engine: string | null;
}

export interface QuerySummary {
  id: string;
  keyword: string;
  created: string | null;
  engine: string | null;
  content_score: number | null;
  word_count: number | null;
  tags: string[];
  url: string;
}

export interface TermRange {
  term: string;
  min: number | null;
  max: number | null;
}

export interface Competitor {
  rank: number;
  url: string;
  title: string | null;
  content_score: number | null;
  word_count: number | null;
}

export interface Recommendations {
  query_id: string;
  keyword: string | null;
  status: 'ready' | 'not_ready';
  targets: { word_count: number | null; readability: number | null };
  terms: {
    content_basic: TermRange[];
    content_extended: TermRange[];
    title: string[];
    description: string[];
    h1: string[];
    h2: string[];
    entities: string[];
  };
  ideas: { headings: string[]; questions: string[] };
  competitors: Competitor[];
}

export interface ContentRevision {
  query_id: string;
  title: string;
  description: string;
  html: string;
  word_count: number | null;
  saved_at: string | null;
}

export interface ContentInput {
  html: string;
  title?: string;
  description?: string;
}

export interface Score {
  content_score: number | null;
  word_count: number | null;
  readability: number | null;
  details: Record<string, unknown> | null;
}

export interface CreateQueryInput {
  project: string;
  keyword: string;
  engine: string;
  language: string;
  additional_keywords?: string[];
}

export interface Outline {
  content: string;
  ai_credits: number | null;
}

export interface Backend {
  readonly name: BackendName;
  status(signal?: AbortSignal): Promise<AccountStatus>;
  listProjects(signal?: AbortSignal): Promise<Project[]>;
  listQueries(projectId: string, signal?: AbortSignal): Promise<QuerySummary[]>;
  getRecommendations(queryId: string, signal?: AbortSignal): Promise<Recommendations>;
  getContent(queryId: string, signal?: AbortSignal): Promise<ContentRevision>;
  scoreContent(queryId: string, input: ContentInput, signal?: AbortSignal): Promise<Score>;
  /** Saves the content as a new revision and returns its score. */
  importContent(queryId: string, input: ContentInput, signal?: AbortSignal): Promise<Score>;
  setDone(queryId: string, done: boolean, signal?: AbortSignal): Promise<void>;
  /** Spends 1 Content Writer analysis. Returns the new query id once it is listed. */
  createQuery(input: CreateQueryInput, signal?: AbortSignal): Promise<{ query_id: string | null }>;
  /** Spends AI credits. */
  generateOutline(queryId: string, signal?: AbortSignal): Promise<Outline>;
  close(): Promise<void>;
}

export const APP_URL = 'https://app.neuronwriter.com';

export function analysisUrl(queryId: string): string {
  return `${APP_URL}/analysis/view/${queryId}`;
}
