import type { SessionFeatures } from './features.js';

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
  /** The competitor page's H1-H3 outline, in order. */
  headings: Array<{ level: number; text: string }>;
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

export const AI_KINDS = ['outline', 'meta', 'intro', 'paragraph', 'faq', 'rephrase', 'expand', 'article'] as const;
export type AiKind = (typeof AI_KINDS)[number];
export const AI_TONES = ['neutral', 'expert', 'formal', 'informal', 'witty', 'funny', 'serious', 'respectful', 'motivating'] as const;
export const AI_MODELS = { default: 0, 'gpt-5': 2, claude: 3, gemini: 4 } as const;
export type AiModel = keyof typeof AI_MODELS;

export interface AiRequest {
  kind: AiKind;
  title?: string;
  /** Text to rephrase/expand, or bullet points for intro/paragraph. */
  text?: string;
  /** Heading of the paragraph to write. */
  heading?: string;
  tone?: (typeof AI_TONES)[number];
  word_count?: number;
  model?: AiModel;
}

export interface AiResult {
  content: string;
  /** Meta title (kind "meta"; content is then the meta description). */
  title: string | null;
  usage: string | null;
}

export interface PageContent {
  url: string;
  title: string;
  description: string;
  html: string;
}

export interface ContentPlanIdea {
  id: string;
  keyword: string;
  additional_keywords: string[];
  added: string | null;
  assigned_to: string | null;
  expected: string | null;
}

export interface ProjectSettings {
  project_id: string;
  mode: 'domain' | 'nondomain';
  name: string;
  homepage: string;
  engine: string;
  language: string;
  treat_title_as_h1: boolean;
  disable_long_terms: boolean;
  keywords: { desired: string[]; brand: string[]; negative: string[]; competitors: string[] };
  domains: { competitors: string[]; excluded: string[] };
  ai_profile: { overview: string; products_pricing: string; labeling_entities: string; personas: string; brand_voice: string };
  report_contact_info: string;
  /** The application password itself is never returned. */
  wordpress: { user: string; password_set: boolean; subdirectory: boolean; subdirectory_url: string };
}

/** Settings the tools may change. WordPress credentials, logo and currency are left as they are. */
export type ProjectSettingsPatch = Partial<Pick<ProjectSettings, 'name' | 'homepage' | 'engine' | 'language' | 'treat_title_as_h1' | 'disable_long_terms' | 'report_contact_info'>> & {
  keywords?: Partial<ProjectSettings['keywords']>;
  domains?: Partial<ProjectSettings['domains']>;
  ai_profile?: Partial<ProjectSettings['ai_profile']>;
};

export type CompetitorSelection = { mode: 'top10' | 'top30' } | { mode: 'custom'; keep_urls: string[] };

export interface Backend {
  readonly name: BackendName;
  /** Session-only capabilities (the web app beyond the public API); absent on the API backend. */
  readonly features?: SessionFeatures;
  status(signal?: AbortSignal): Promise<AccountStatus>;
  listProjects(signal?: AbortSignal): Promise<Project[]>;
  listQueries(projectId: string, signal?: AbortSignal): Promise<QuerySummary[]>;
  getRecommendations(queryId: string, signal?: AbortSignal): Promise<Recommendations>;
  getContent(queryId: string, signal?: AbortSignal): Promise<ContentRevision>;
  scoreContent(queryId: string, input: ContentInput, signal?: AbortSignal): Promise<Score>;
  /** Saves the content as a new revision and returns its score. */
  importContent(queryId: string, input: ContentInput, signal?: AbortSignal): Promise<Score>;
  /** Spends 1 Content Writer analysis. Returns the new query id once it is listed. */
  createQuery(input: CreateQueryInput, signal?: AbortSignal): Promise<{ query_id: string | null }>;
  close(): Promise<void>;
}

export const APP_URL = 'https://app.neuronwriter.com';

export function analysisUrl(queryId: string): string {
  return `${APP_URL}/analysis/view/${queryId}`;
}
